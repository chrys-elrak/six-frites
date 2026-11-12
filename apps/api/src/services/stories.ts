import type { Prisma } from "../generated/prisma/client.js";
import {
  cleanLinksIn,
  AppError,
  type CreateStoryInput,
  NOTE_SECS,
  type NoteDTO,
  type NoteViewerDTO,
  type LabelFont,
  type NotesDTO,
  type PublicUser,
  STORY_LIMITS,
  type StoryDrawing,
  type StoryAsk,
  type StoryDTO,
  type StoryGroupDTO,
  type StoryLink,
  type StoryLocation,
  type StoryPositions,
  type StoryReaction,
  type StoryViewerDTO,
} from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { presignGet } from "../lib/storage.js";
import { blockedWith } from "./blocks.js";
import { postNotice } from "./chats.js";
import { profilesFor } from "./contacts.js";
import { pairAlias } from "./users.js";
import { seenIn } from "./push.js";
import { deliverStoryReactionPush } from "./push.js";
import { notify } from "./notifications.js";
import { sharedGif } from "./gifs.js";
import { followShareLink } from "./link-previews.js";
import { SHARED_PREFIX, purgeUploads, toAttachmentDTO } from "./uploads.js";

/** Most stories one person can have up at once. */
const MAX_ACTIVE = 50;

const storyInclude = (viewerId: string) =>
  ({
    upload: true,
    user: { select: { askCode: true } },
    views: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { views: true } },
  }) satisfies Prisma.StoryInclude;
type StoryRow = Prisma.StoryGetPayload<{ include: ReturnType<typeof storyInclude> }>;

/** People who see `userId`'s stories, and whose stories they see: everyone they share a direct chat with. */
async function contactIds(db: Tx, userId: string) {
  const [rows, blocked] = await Promise.all([
    db.chatMember.findMany({
      where: {
        userId: { not: userId },
        user: { deletedAt: null },
        chat: { type: "direct", supportUserId: null, members: { some: { userId } } },
      },
      select: { userId: true },
    }),
    blockedWith(db, userId),
  ]);
  return [...new Set(rows.map((r) => r.userId))].filter((id) => !blocked.has(id));
}

/** Tells the poster's devices and contacts to fetch the stories again. */
export async function announceStories(userId: string) {
  const to = [userId, ...(await contactIds(prisma, userId))];
  broadcaster().to(to.map(rooms.user)).emit("stories:changed", { userId });
}

const tooLong = (s: StoryRow) =>
  s.upload?.kind === "video" &&
  s.upload.durationMs !== null &&
  s.upload.durationMs > STORY_LIMITS.videoMs + STORY_LIMITS.videoSlackMs;

/** Others only see a story once its photo or video is ready, and never a video over 30 seconds. */
const showable = (s: StoryRow) => !s.uploadId || (s.upload?.status === "ready" && !tooLong(s));

function toStoryDTO(s: StoryRow, viewerId: string, senders: Senders = new Map()): StoryDTO {
  const mine = s.userId === viewerId;
  return {
    id: s.id,
    type: s.upload ? (s.upload.kind === "video" ? "video" : "image") : "text",
    text: s.text,
    fromChat: s.fromChat,
    bubble: s.bubble,
    quote: quoteFor(s, viewerId, senders),
    background: s.background,
    media: s.upload ? toAttachmentDTO(s.upload) : null,
    ...withGifs(s),
    ...withAsks(s.ask),
    location: s.location as StoryLocation | null,
    link: s.link as StoryLink | null,
    askCode: s.askLink ? s.user.askCode : null,
    askText: s.askLink ? s.askText : null,
    showDate: s.showDate,
    showTime: s.showTime,
    positions: (s.positions as StoryPositions | null) ?? {},
    drawing: (s.drawing as StoryDrawing | null) ?? { strokes: [], texts: [] },
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    seen: mine || s.views.length > 0,
    viewCount: mine ? s._count.views : null,
  };
}

/** My stories first, then each contact's, the ones with stories I haven't opened first, newest first. */
export async function listStories(viewerId: string): Promise<{ items: StoryGroupDTO[] }> {
  const ids = await contactIds(prisma, viewerId);
  const rows = await prisma.story.findMany({
    where: { userId: { in: [viewerId, ...ids] }, expiresAt: { gt: new Date() } },
    include: storyInclude(viewerId),
    orderBy: { createdAt: "asc" },
  });
  const visible = rows.filter((s) => s.userId === viewerId || showable(s));
  const userIds = [...new Set(visible.map((s) => s.userId))];
  const [users, profile, senders] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    profilesFor(prisma, viewerId, userIds),
    quoteSenders(viewerId, visible),
  ]);
  const groups = users.map((u) => {
    const stories = visible.filter((s) => s.userId === u.id).map((s) => toStoryDTO(s, viewerId, senders));
    return { user: profile(u), stories };
  });
  const rank = (g: StoryGroupDTO) => (g.user.id === viewerId ? 0 : g.stories.some((s) => !s.seen) ? 1 : 2);
  const latest = (g: StoryGroupDTO) => g.stories[g.stories.length - 1]!.createdAt;
  groups.sort((a, b) => rank(a) - rank(b) || latest(b).localeCompare(latest(a)));
  return { items: groups };
}

/** What a story keeps of an anonymous message on it: its text and prompt, and where its photo or GIF is stored. */
type StoredAsk = {
  text: string;
  prompt: string | null;
  photoKey: string | null;
  gif: { key: string; width: number | null; height: number | null } | null;
};

/** An anonymous message the user received, as its story card; it needs text, a photo or a GIF to show. */
async function askCard(userId: string, askId: string): Promise<StoredAsk> {
  const m = await prisma.anonMessage.findFirst({ where: { id: askId, recipientId: userId, recipientDeletedAt: null } });
  if (!m || (!m.text.trim() && !m.photoKey && !m.gifKey)) {
    throw new AppError("NOT_FOUND", "That anonymous message is gone or has nothing to show on a story");
  }
  const gif = m.gifKey ? { key: m.gifKey, width: m.gifWidth, height: m.gifHeight } : null;
  return { text: m.text, prompt: m.prompt, photoKey: m.photoKey, gif };
}

type StoredGif = { key: string; width: number | null; height: number | null };

/** A story's GIFs; before there could be several, it kept just one, in its own columns. */
function withGifs(s: StoryRow): Pick<StoryDTO, "gif" | "gifs"> {
  const stored = (s.gifs as StoredGif[] | null) ?? (s.gifKey ? [{ key: s.gifKey, width: s.gifWidth, height: s.gifHeight }] : []);
  const gifs = stored.map((g) => ({ url: presignGet(g.key), width: g.width, height: g.height }));
  return { gif: gifs[0] ?? null, gifs };
}

/** A story's anonymous messages; before there could be several, it kept just one, not in a list. */
function withAsks(stored: unknown): Pick<StoryDTO, "ask" | "asks"> {
  const asks = ((Array.isArray(stored) ? stored : stored ? [stored] : []) as StoredAsk[]).map(toAskDTO);
  return { ask: asks[0] ?? null, asks };
}

function toAskDTO({ text, prompt, photoKey, gif }: StoredAsk): StoryAsk {
  return {
    text,
    prompt,
    photoUrl: photoKey ? presignGet(photoKey) : null,
    gif: gif && { url: presignGet(gif.key), width: gif.width, height: gif.height },
  };
}

/** Checks a finished photo or video upload can go into a story, and isn't in a message or another story. */
async function claimUpload(userId: string, uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    include: { messages: { select: { id: true } }, scheduled: { select: { id: true } }, story: { select: { id: true } } },
  });
  if (!upload || upload.ownerId !== userId) throw new AppError("UPLOAD_NOT_FOUND");
  if (upload.encrypted || (upload.kind !== "image" && upload.kind !== "video")) {
    throw new AppError("VALIDATION_FAILED", "A story can show a photo or a video");
  }
  if (upload.status === "pending") throw new AppError("UPLOAD_NOT_READY", "Complete the upload before posting it");
  if (upload.status === "failed" || upload.status === "removed") {
    throw new AppError("UPLOAD_NOT_READY", "This file could not be processed");
  }
  if (upload.messages.length || upload.scheduled || upload.story) throw new AppError("UPLOAD_IN_USE");
  if (upload.kind === "video" && (upload.durationMs ?? 0) > STORY_LIMITS.videoMs + STORY_LIMITS.videoSlackMs) {
    throw new AppError("VALIDATION_FAILED", "Story videos can be at most 30 seconds");
  }
}

type Quote = NonNullable<StoryDTO["quote"]>;
type Senders = Map<string, PublicUser>;

/** The people behind the chat messages on these stories or notes, as `viewerId` sees them, not as the poster did. */
async function quoteSenders(viewerId: string, rows: { userId: string; fromChat: boolean; quote: Prisma.JsonValue }[]): Promise<Senders> {
  const ids = [...new Set(rows.flatMap((r) => (r.fromChat && r.quote && r.userId !== viewerId ? [(r.quote as Quote).from.id] : [])))];
  if (!ids.length) return new Map();
  const [users, profile] = await Promise.all([prisma.user.findMany({ where: { id: { in: ids } } }), profilesFor(prisma, viewerId, ids)]);
  return new Map(users.map((u) => [u.id, profile(u)]));
}

/** The poster sees who sent the message as they did when sharing it; anyone else sees that person as they themselves would. */
function quoteFor(r: { userId: string; fromChat: boolean; quote: Prisma.JsonValue }, viewerId: string, senders: Senders): Quote | null {
  if (!r.fromChat || !r.quote) return null;
  const q = r.quote as Quote;
  if (r.userId === viewerId) return q;
  return { from: senders.get(q.from.id) ?? { id: q.from.id, displayName: pairAlias(viewerId, q.from.id), avatarUrl: null }, sentAt: q.sentAt };
}

/** Who sent a message in one of `userId`'s chats, as they see them there, and when. */
async function quoteOf(userId: string, messageId: string): Promise<NonNullable<StoryDTO["quote"]>> {
  const m = await prisma.message.findFirst({
    where: { id: messageId, deletedAt: null, chat: { members: { some: { userId } } } },
    select: { chatId: true, createdAt: true, sender: true },
  });
  if (!m) throw new AppError("MESSAGE_NOT_FOUND");
  const p: PublicUser = await seenIn(m.chatId, userId, m.sender);
  return { from: { id: p.id, displayName: p.displayName, avatarUrl: p.avatarUrl, ...(p.alias && { alias: p.alias }) }, sentAt: m.createdAt.toISOString() };
}

/** Tells the chat a shared message came from that `userId` put it up as their story or note, unless they wrote it. */
async function announceShare(userId: string, messageId: string, to: "story" | "note") {
  const m = await prisma.message.findUnique({ where: { id: messageId }, select: { chatId: true, senderId: true } });
  if (!m || m.senderId === userId) return;
  await postNotice(userId, m.chatId, { type: "shared_to", to }).catch((err) => console.error("could not announce a share:", err.message));
}

export async function createStory(userId: string, input: CreateStoryInput): Promise<StoryDTO> {
  const active = await prisma.story.count({ where: { userId, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE) throw new AppError("STORY_LIMIT_REACHED", `You can have at most ${MAX_ACTIVE} stories up`);
  if (input.uploadId) await claimUpload(userId, input.uploadId);
  const gifs = (await Promise.all((input.gifIds ?? (input.gifId ? [input.gifId] : [])).map(sharedGif))).map(({ key, width, height }) => ({
    key,
    width,
    height,
  }));
  const asks = await Promise.all((input.askIds ?? (input.askId ? [input.askId] : [])).map((id) => askCard(userId, id)));
  const quote = input.fromChat && input.messageId && input.text && !input.uploadId ? await quoteOf(userId, input.messageId) : null;

  const story = await prisma.story.create({
    data: {
      userId,
      text: input.text || null,
      fromChat: !!input.text && !input.uploadId && (input.fromChat ?? false),
      bubble: input.text && !input.uploadId && input.fromChat ? (input.bubble ?? null) : null,
      background: input.uploadId ? null : (input.background ?? null),
      uploadId: input.uploadId,
      ...(gifs.length && { gifs }),
      location: input.location,
      ...(input.link && { link: input.link }),
      askLink: input.askLink ?? false,
      askText: (input.askLink && input.askText) || null,
      ...(asks.length && { ask: asks }),
      ...(quote && { quote }),
      showDate: input.showDate ?? false,
      showTime: input.showTime ?? false,
      ...(input.positions && { positions: input.positions }),
      ...(input.drawing && { drawing: input.drawing }),
      expiresAt: new Date(Date.now() + input.durationSecs * 1000),
    },
    include: storyInclude(userId),
  });
  await announceStories(userId);
  if (quote && input.messageId) await announceShare(userId, input.messageId, "story");
  return toStoryDTO(story, userId);
}

/** A story `viewerId` may open: their own, or a contact's that is still up. */
async function visibleStory(viewerId: string, storyId: string) {
  const story = await prisma.story.findUnique({ where: { id: storyId }, include: storyInclude(viewerId) });
  if (!story || story.expiresAt <= new Date()) throw new AppError("STORY_NOT_FOUND");
  if (story.userId !== viewerId && (!showable(story) || !(await contactIds(prisma, viewerId)).includes(story.userId))) {
    throw new AppError("STORY_NOT_FOUND");
  }
  return story;
}

export async function markStoryViewed(viewerId: string, storyId: string) {
  const story = await visibleStory(viewerId, storyId);
  if (story.userId === viewerId) return;
  await prisma.storyView.upsert({
    where: { storyId_userId: { storyId, userId: viewerId } },
    create: { storyId, userId: viewerId },
    update: {},
  });
}

const MAX_REACTIONS = 30;

/**
 * Adds an emoji to someone's reactions on a contact's story, which also counts as opening it; they can react
 * again and again, and only the last 30 are kept. The append is one statement, so quick taps all count. The poster
 * hears about it live in an open app, or by a push on the devices they aren't using, the first time each emoji comes.
 */
export async function reactToStory(viewerId: string, storyId: string, emoji: StoryReaction) {
  const story = await visibleStory(viewerId, storyId);
  if (story.userId === viewerId) throw new AppError("STORY_NOT_FOUND");
  const [row] = await prisma.$queryRaw<{ reactions: string[] }[]>`
    INSERT INTO "StoryView" ("storyId", "userId", "reactions") VALUES (${storyId}, ${viewerId}, ARRAY[${emoji}::text])
    ON CONFLICT ("storyId", "userId") DO UPDATE SET "reactions" =
      ("StoryView"."reactions" || ${emoji}::text)[greatest(1, cardinality("StoryView"."reactions") + 2 - ${MAX_REACTIONS}::int):]
    RETURNING "reactions"`;
  if (row!.reactions.filter((r) => r === emoji).length > 1) return;
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: viewerId } });
  const user = (await profilesFor(prisma, story.userId, [viewerId]))(viewer);
  broadcaster().to(rooms.user(story.userId)).emit("story:reacted", { storyId, user, emoji });
  void deliverStoryReactionPush(story.userId, user, emoji).catch(() => null);
  const chat = await prisma.chat.findUnique({ where: { directKey: [viewerId, story.userId].sort().join(":") }, select: { id: true } });
  await withEvents((tx, emit) =>
    notify(tx, emit, { userId: story.userId, actorId: viewerId, kind: "story_reaction", chatId: chat?.id, emoji }),
  );
}

export async function listStoryViewers(userId: string, storyId: string): Promise<{ items: StoryViewerDTO[] }> {
  const story = await visibleStory(userId, storyId);
  if (story.userId !== userId) throw new AppError("STORY_NOT_FOUND");
  const views = await prisma.storyView.findMany({
    where: { storyId },
    include: { user: true },
    orderBy: { viewedAt: "desc" },
  });
  const profile = await profilesFor(prisma, userId, views.map((v) => v.userId));
  return {
    items: views.map((v) => ({
      user: profile(v.user),
      viewedAt: v.viewedAt.toISOString(),
      reactions: v.reactions as StoryReaction[],
    })),
  };
}

export async function deleteStory(userId: string, storyId: string) {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story || story.userId !== userId) throw new AppError("STORY_NOT_FOUND");
  await prisma.story.delete({ where: { id: storyId } });
  if (story.uploadId) await purgeUploads([story.uploadId]);
  await announceStories(userId);
}

type NoteRow = {
  id: string;
  userId: string;
  text: string;
  fromChat: boolean;
  quote: Prisma.JsonValue;
  font: string | null;
  location: Prisma.JsonValue;
  background: string | null;
  gifKey: string | null;
  gifWidth: number | null;
  gifHeight: number | null;
  createdAt: Date;
  expiresAt: Date;
};

const toNoteDTO = (n: NoteRow, viewCount: number | null, quote: NoteDTO["quote"]): NoteDTO => ({
  id: n.id,
  text: n.text,
  fromChat: n.fromChat,
  font: n.font as LabelFont | null,
  quote,
  background: n.background,
  gif: n.gifKey
    ? { id: n.gifKey.slice(SHARED_PREFIX.length, -".mp4".length), url: presignGet(n.gifKey), width: n.gifWidth, height: n.gifHeight }
    : null,
  location: n.location as StoryLocation | null,
  viewCount,
  createdAt: n.createdAt.toISOString(),
  expiresAt: n.expiresAt.toISOString(),
});

/** My note and my contacts' notes that are still up. */
export async function listNotes(userId: string): Promise<NotesDTO> {
  const ids = await contactIds(prisma, userId);
  const rows = await prisma.note.findMany({
    where: { userId: { in: [userId, ...ids] }, expiresAt: { gt: new Date() } },
    include: { user: true, _count: { select: { views: true } } },
    orderBy: { createdAt: "desc" },
  });
  const [profile, senders] = await Promise.all([profilesFor(prisma, userId, ids), quoteSenders(userId, rows)]);
  const mine = rows.find((n) => n.userId === userId);
  return {
    mine: mine ? toNoteDTO(mine, mine._count.views, quoteFor(mine, userId, senders)) : null,
    items: rows.filter((n) => n !== mine).map((n) => ({ user: profile(n.user), note: toNoteDTO(n, null, quoteFor(n, userId, senders)) })),
  };
}

/** Puts up a note, for a day unless asked otherwise, in place of the one before. */
export async function setNote(
  userId: string,
  {
    text,
    fromChat,
    messageId,
    font,
    gifId,
    location,
    background,
    durationSecs = NOTE_SECS,
  }: {
    text: string;
    fromChat?: boolean;
    messageId?: string;
    font?: LabelFont;
    gifId?: string;
    location?: StoryLocation;
    background?: string;
    durationSecs?: number;
  },
): Promise<NoteDTO> {
  const gif = gifId ? await sharedGif(gifId) : null;
  const clean = await cleanLinksIn(text, [], followShareLink);
  const previous = await prisma.note.findUnique({ where: { userId }, select: { text: true, fromChat: true, quote: true } });
  const kept = previous?.fromChat && previous.text === clean.text ? previous.quote : null;
  const quote = fromChat && clean.text ? (messageId ? await quoteOf(userId, messageId) : kept) : null;
  await prisma.note.deleteMany({ where: { userId } });
  const note = await prisma.note.create({
    data: {
      userId,
      text: clean.text,
      fromChat: !!clean.text && (fromChat ?? false),
      ...(quote && { quote: quote as Prisma.InputJsonValue }),
      ...(location && { location }),
      font: font === "classic" ? null : (font ?? null),
      background,
      gifKey: gif?.key,
      gifWidth: gif?.width,
      gifHeight: gif?.height,
      expiresAt: new Date(Date.now() + durationSecs * 1000),
    },
  });
  await announceStories(userId);
  if (fromChat && clean.text && messageId) await announceShare(userId, messageId, "note");
  return toNoteDTO(note, 0, quoteFor(note, userId, new Map()));
}

/** Counts a contact opening a note, or the link in it; opening your own doesn't count. */
export async function markNoteViewed(viewerId: string, noteId: string, clicked = false) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note || note.expiresAt <= new Date()) throw new AppError("STORY_NOT_FOUND");
  if (note.userId === viewerId) return;
  if (!(await contactIds(prisma, viewerId)).includes(note.userId)) throw new AppError("STORY_NOT_FOUND");
  await prisma.noteView.upsert({
    where: { noteId_userId: { noteId, userId: viewerId } },
    create: { noteId, userId: viewerId, clickedAt: clicked ? new Date() : null },
    update: clicked ? { clickedAt: new Date() } : {},
  });
}

/** Adds an emoji to someone's reactions on a contact's note, the way `reactToStory` does for a story. */
export async function reactToNote(viewerId: string, noteId: string, emoji: StoryReaction) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note || note.expiresAt <= new Date() || note.userId === viewerId) throw new AppError("STORY_NOT_FOUND");
  if (!(await contactIds(prisma, viewerId)).includes(note.userId)) throw new AppError("STORY_NOT_FOUND");
  const [row] = await prisma.$queryRaw<{ reactions: string[] }[]>`
    INSERT INTO "NoteView" ("noteId", "userId", "reactions") VALUES (${noteId}, ${viewerId}, ARRAY[${emoji}::text])
    ON CONFLICT ("noteId", "userId") DO UPDATE SET "reactions" =
      ("NoteView"."reactions" || ${emoji}::text)[greatest(1, cardinality("NoteView"."reactions") + 2 - ${MAX_REACTIONS}::int):]
    RETURNING "reactions"`;
  if (row!.reactions.filter((r) => r === emoji).length > 1) return;
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: viewerId } });
  const user = (await profilesFor(prisma, note.userId, [viewerId]))(viewer);
  broadcaster().to(rooms.user(note.userId)).emit("story:reacted", { storyId: noteId, user, emoji, note: true });
  void deliverStoryReactionPush(note.userId, user, emoji, true).catch(() => null);
  const chat = await prisma.chat.findUnique({ where: { directKey: [viewerId, note.userId].sort().join(":") }, select: { id: true } });
  await withEvents((tx, emit) =>
    notify(tx, emit, { userId: note.userId, actorId: viewerId, kind: "note_reaction", chatId: chat?.id, emoji }),
  );
}

/** Who opened the note I have up, latest first. */
export async function listNoteViewers(userId: string): Promise<{ items: NoteViewerDTO[] }> {
  const views = await prisma.noteView.findMany({
    where: { note: { userId, expiresAt: { gt: new Date() } } },
    include: { user: true },
    orderBy: { viewedAt: "desc" },
  });
  const profile = await profilesFor(prisma, userId, views.map((v) => v.userId));
  return {
    items: views.map((v) => ({ user: profile(v.user), viewedAt: v.viewedAt.toISOString(), clickedAt: v.clickedAt?.toISOString() ?? null, reactions: v.reactions as StoryReaction[] })),
  };
}

export async function deleteNote(userId: string) {
  const { count } = await prisma.note.deleteMany({ where: { userId } });
  if (count) await announceStories(userId);
}

/** Deletes stories whose time is up, with their photos and videos. */
export async function deleteExpiredStories() {
  const expired = await prisma.story.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true, uploadId: true },
    take: 500,
  });
  if (!expired.length) return 0;
  await prisma.story.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } });
  await purgeUploads(expired.flatMap((s) => (s.uploadId ? [s.uploadId] : [])));
  return expired.length;
}
