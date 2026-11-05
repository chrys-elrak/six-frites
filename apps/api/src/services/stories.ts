import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  type CreateStoryInput,
  STORY_LIMITS,
  type StoryDrawing,
  type StoryDTO,
  type StoryGroupDTO,
  type StoryLocation,
  type StoryPositions,
  type StoryReaction,
  type StoryViewerDTO,
} from "@six/shared";
import type { Tx } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { presignGet } from "../lib/storage.js";
import { blockedWith } from "./blocks.js";
import { profilesFor } from "./contacts.js";
import { deliverStoryReactionPush } from "./push.js";
import { sharedGif } from "./gifs.js";
import { purgeUploads, toAttachmentDTO } from "./uploads.js";

/** Most stories one person can have up at once. */
const MAX_ACTIVE = 50;

const storyInclude = (viewerId: string) =>
  ({
    upload: true,
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

function toStoryDTO(s: StoryRow, viewerId: string): StoryDTO {
  const mine = s.userId === viewerId;
  return {
    id: s.id,
    type: s.upload ? (s.upload.kind === "video" ? "video" : "image") : "text",
    text: s.text,
    background: s.background,
    media: s.upload ? toAttachmentDTO(s.upload) : null,
    gif: s.gifKey ? { url: presignGet(s.gifKey), width: s.gifWidth, height: s.gifHeight } : null,
    ask: s.ask ? toAskDTO(s.ask as unknown as StoredAsk) : null,
    location: s.location as StoryLocation | null,
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
  const [users, profile] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    profilesFor(prisma, viewerId, userIds),
  ]);
  const groups = users.map((u) => {
    const stories = visible.filter((s) => s.userId === u.id).map((s) => toStoryDTO(s, viewerId));
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

function toAskDTO({ text, prompt, photoKey, gif }: StoredAsk): NonNullable<StoryDTO["ask"]> {
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

export async function createStory(userId: string, input: CreateStoryInput): Promise<StoryDTO> {
  const active = await prisma.story.count({ where: { userId, expiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE) throw new AppError("STORY_LIMIT_REACHED", `You can have at most ${MAX_ACTIVE} stories up`);
  if (input.uploadId) await claimUpload(userId, input.uploadId);
  const gif = input.gifId ? await sharedGif(input.gifId) : null;
  const ask = input.askId ? await askCard(userId, input.askId) : null;

  const story = await prisma.story.create({
    data: {
      userId,
      text: input.text || null,
      background: input.uploadId ? null : (input.background ?? null),
      uploadId: input.uploadId,
      gifKey: gif?.key,
      gifWidth: gif?.width,
      gifHeight: gif?.height,
      location: input.location,
      ...(ask && { ask }),
      showDate: input.showDate ?? false,
      showTime: input.showTime ?? false,
      ...(input.positions && { positions: input.positions }),
      ...(input.drawing && { drawing: input.drawing }),
      expiresAt: new Date(Date.now() + input.durationSecs * 1000),
    },
    include: storyInclude(userId),
  });
  await announceStories(userId);
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
