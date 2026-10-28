import { createId } from "@paralleldrive/cuid2";
import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  MAX_MUTE_SECS,
  type ChatDTO,
  type ChatListQuery,
  type ChatDeliveredDTO,
  type ChatReadDTO,
  type DeleteScope,
  type MarkReadInput,
  type ServiceAction,
  type UpdateChatInput,
} from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import {
  assertMember,
  createMessage,
  messageInclude,
  scrubMessageEvents,
  toMessageDTO,
  visibleTo,
} from "./messages.js";
import { blockState } from "./blocks.js";
import { profilesFor } from "./contacts.js";
import { purgeUploads } from "./uploads.js";

const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

const chatInclude = {
  members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
} satisfies Prisma.ChatInclude;

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof chatInclude }>;

/** A timed mute that has run out reads as not muted, without anyone having to clear it. */
export function memberMuted(m: { muted: boolean; mutedUntil: Date | null }, now = new Date()) {
  return m.muted && (m.mutedUntil === null || m.mutedUntil > now);
}

function muteState(m: { muted: boolean; mutedUntil: Date | null }) {
  const muted = memberMuted(m);
  return { muted, mutedUntil: muted ? (m.mutedUntil?.toISOString() ?? null) : null };
}

function muteData({ muted, mutedUntil }: Pick<UpdateChatInput, "muted" | "mutedUntil">) {
  if (mutedUntil != null && muted !== true) throw new AppError("VALIDATION_FAILED", "mutedUntil needs muted: true");
  if (muted === undefined) return {};
  if (!muted) return { muted, mutedUntil: null };
  const until = mutedUntil ? new Date(mutedUntil) : null;
  if (until && (until <= new Date() || until.getTime() - Date.now() > MAX_MUTE_SECS * 1000)) {
    throw new AppError("VALIDATION_FAILED", "mutedUntil must be in the next year");
  }
  return { muted, mutedUntil: until };
}

async function toChatDTO(db: Tx, chat: ChatWithRelations, viewerId: string): Promise<ChatDTO> {
  const me = chat.members.find((m) => m.userId === viewerId);
  if (!me) throw new AppError("CHAT_NOT_FOUND");
  const shown = await profilesFor(db, viewerId, chat.members.map((m) => m.userId));
  const members = chat.members.map((m) => ({ ...m, shown: shown(m.user) }));
  const others = members.filter((m) => m.userId !== viewerId);
  const peer = others[0];
  const blocks = peer ? await blockState(db, viewerId, peer.userId) : { byMe: false, byThem: false };

  const visible = { chatId: chat.id, ...visibleTo(viewerId, me.clearedAt) };
  const readFloor = [me.lastReadAt, me.clearedAt].filter((d): d is Date => d !== null).sort((a, b) => +b - +a)[0];
  const [lastMessage, unreadCount, scheduledCount] = await Promise.all([
    db.message.findFirst({ where: visible, orderBy: newestFirst, include: messageInclude }),
    db.message.count({
      where: {
        ...visible,
        senderId: { not: viewerId },
        deletedAt: null,
        ...(readFloor && { createdAt: { gt: readFloor } }),
      },
    }),
    db.scheduledMessage.count({ where: { chatId: chat.id, senderId: viewerId } }),
  ]);

  return {
    id: chat.id,
    type: "direct",
    title: others.map((m) => m.shown.displayName).join(", ") || "Just you",
    members: members.map((m) => ({
      user: m.shown,
      lastDeliveredMessageId: m.lastDeliveredMessageId,
      lastDeliveredAt: m.lastDeliveredAt?.toISOString() ?? null,
      lastReadMessageId: m.lastReadMessageId,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
    })),
    lastMessage: lastMessage ? toMessageDTO(lastMessage, viewerId) : null,
    unreadCount,
    archived: me.archived,
    ...muteState(me),
    pinned: me.pinned,
    safeView: me.safeView,
    sharingProfile: me.showProfile,
    autoDeleteSecs: chat.autoDeleteSecs,
    theme: chat.theme,
    scheduledCount,
    blockedByMe: blocks.byMe,
    blockedByThem: blocks.byThem,
    peerDeleted: others.some((m) => m.user.deletedAt !== null),
    encrypted: chat.encryptedAt !== null,
    lastActivityAt: chat.lastMessageAt.toISOString(),
    createdAt: chat.createdAt.toISOString(),
  };
}

export async function getChat(userId: string, chatId: string, db: Tx = prisma) {
  const chat = await db.chat.findUnique({ where: { id: chatId }, include: chatInclude });
  if (!chat) throw new AppError("CHAT_NOT_FOUND");
  return toChatDTO(db, chat, userId);
}

function encodeCursor(at: Date, id: string) {
  return Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const at = new Date(iso ?? "");
  if (!id || Number.isNaN(at.getTime())) throw new AppError("VALIDATION_FAILED", "Invalid cursor");
  return { at, id };
}

export async function listChats(userId: string, q: ChatListQuery) {
  const after = q.cursor ? decodeCursor(q.cursor) : null;
  const rows = await prisma.chat.findMany({
    where: {
      members: { some: { userId, archived: q.archived, hidden: false } },
      ...(after && {
        OR: [{ lastMessageAt: { lt: after.at } }, { lastMessageAt: after.at, id: { lt: after.id } }],
      }),
    },
    include: chatInclude,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
  });

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: await Promise.all(page.map((c) => toChatDTO(prisma, c, userId))),
    nextCursor: hasMore && last ? encodeCursor(last.lastMessageAt, last.id) : null,
  };
}

export async function ensureDirectChat(tx: Tx, emit: Emit, a: string, b: string) {
  const directKey = [a, b].sort().join(":");
  const existing = await tx.chat.findUnique({ where: { directKey } });
  if (existing) return existing.id;

  const chat = await tx.chat.create({
    data: { type: "direct", directKey, members: { create: [{ userId: a }, { userId: b }] } },
    include: chatInclude,
  });
  for (const userId of [a, b]) emit(userId, "chat.updated", await toChatDTO(tx, chat, userId));
  return chat.id;
}

async function findTarget(tx: Tx, chatId: string, messageId: string | undefined) {
  const target = messageId
    ? await tx.message.findFirst({ where: { id: messageId, chatId } })
    : await tx.message.findFirst({ where: { chatId }, orderBy: newestFirst });
  if (messageId && !target) throw new AppError("MESSAGE_NOT_FOUND");
  return target;
}

export async function markDelivered(
  userId: string,
  chatId: string,
  input: MarkReadInput,
): Promise<ChatDeliveredDTO | null> {
  return withEvents(async (tx, emit) => {
    const member = await assertMember(tx, chatId, userId);
    const target = await findTarget(tx, chatId, input.messageId);
    if (!target) return null;
    const floor = [member.lastDeliveredAt, member.lastReadAt].filter((d): d is Date => d !== null);
    if (floor.some((d) => d >= target.createdAt)) return null;

    await tx.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastDeliveredMessageId: target.id, lastDeliveredAt: target.createdAt },
    });
    const delivered: ChatDeliveredDTO = {
      chatId,
      userId,
      lastDeliveredMessageId: target.id,
      lastDeliveredAt: target.createdAt.toISOString(),
    };
    const members = await tx.chatMember.findMany({
      where: { chatId, userId: { not: userId } },
      select: { userId: true },
    });
    for (const m of members) emit(m.userId, "chat.delivered", delivered);
    return delivered;
  });
}

export async function markRead(userId: string, chatId: string, input: MarkReadInput): Promise<ChatReadDTO | null> {
  return withEvents(async (tx, emit) => {
    const member = await assertMember(tx, chatId, userId);
    const target = await findTarget(tx, chatId, input.messageId);
    if (!target || (member.lastReadAt && member.lastReadAt >= target.createdAt)) return null;

    const deliveredBehind = !member.lastDeliveredAt || member.lastDeliveredAt < target.createdAt;
    await tx.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: {
        lastReadMessageId: target.id,
        lastReadAt: target.createdAt,
        ...(deliveredBehind && { lastDeliveredMessageId: target.id, lastDeliveredAt: target.createdAt }),
      },
    });

    const read: ChatReadDTO = {
      chatId,
      userId,
      lastReadMessageId: target.id,
      lastReadAt: target.createdAt.toISOString(),
    };
    const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) emit(m.userId, "chat.read", read);
    return read;
  });
}

/**
 * Archive, mute and pin only change this member's view. The auto-delete timer and the background are
 * shared: changing either posts a service message and updates the chat for everyone.
 */
export async function updateChat(
  userId: string,
  chatId: string,
  { autoDeleteSecs, theme, muted, mutedUntil, ...view }: UpdateChatInput,
) {
  const mine = { ...view, ...muteData({ muted, mutedUntil }) };
  return withEvents(async (tx, emit) => {
    await assertMember(tx, chatId, userId);
    if (Object.values(mine).some((v) => v !== undefined)) {
      await tx.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: mine });
    }

    const chat = await tx.chat.findUniqueOrThrow({ where: { id: chatId } });
    const actions: ServiceAction[] = [];
    if (autoDeleteSecs !== undefined && autoDeleteSecs !== chat.autoDeleteSecs) {
      actions.push({ type: "auto_delete", secs: autoDeleteSecs });
    }
    if (theme !== undefined && theme !== chat.theme) actions.push({ type: "theme", theme });
    if (!actions.length) {
      const dto = await getChat(userId, chatId, tx);
      emit(userId, "chat.updated", dto);
      return dto;
    }

    await tx.chat.update({
      where: { id: chatId },
      data: { ...(autoDeleteSecs !== undefined && { autoDeleteSecs }), ...(theme !== undefined && { theme }) },
    });
    for (const action of actions) {
      const clientId = `${action.type === "theme" ? "theme" : "auto-delete"}-${createId()}`;
      await createMessage(tx, emit, userId, chatId, { clientId, action });
    }
    const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) emit(m.userId, "chat.updated", await getChat(m.userId, chatId, tx));
    return getChat(userId, chatId, tx);
  });
}

/**
 * `me` clears this user's history and hides the chat until someone writes again.
 * `all` permanently deletes every message for both members but keeps the chat, since a direct
 * chat can only be created through an invite and removing it would cut the two people off.
 */
export async function deleteChat(userId: string, chatId: string, scope: DeleteScope) {
  const detached = await withEvents(async (tx, emit): Promise<string[]> => {
    await assertMember(tx, chatId, userId);

    if (scope === "me") {
      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { hidden: true, pinned: false, clearedAt: new Date() },
      });
      emit(userId, "chat.deleted", { chatId, scope });
      return [];
    }

    const doomed = await tx.message.findMany({ where: { chatId }, select: { id: true, attachmentId: true } });
    const ids = doomed.map((m) => m.id);
    await scrubMessageEvents(tx, ids);
    await tx.message.deleteMany({ where: { chatId } });
    await tx.chatMember.updateMany({ where: { chatId }, data: { lastReadMessageId: null } });

    const members = await tx.chatMember.findMany({ where: { chatId }, select: { userId: true } });
    for (const m of members) {
      emit(m.userId, "chat.deleted", { chatId, scope });
      emit(m.userId, "chat.updated", await getChat(m.userId, chatId, tx));
    }
    return doomed.map((m) => m.attachmentId).filter((a): a is string => !!a);
  });
  await purgeUploads(detached);
}
