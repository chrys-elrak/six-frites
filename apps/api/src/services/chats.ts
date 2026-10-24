import type { Prisma } from "@prisma/client";
import {
  AppError,
  type ChatDTO,
  type ChatListQuery,
  type ChatDeliveredDTO,
  type ChatReadDTO,
  type DeleteScope,
  type MarkReadInput,
  type UpdateChatInput,
} from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { assertMember, messageInclude, scrubMessageEvents, toMessageDTO, visibleTo } from "./messages.js";
import { applyOverride, loadOverrides } from "./contacts.js";
import { purgeUploads } from "./uploads.js";
import { toPublicUser } from "./users.js";

const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

const chatInclude = {
  members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
} satisfies Prisma.ChatInclude;

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof chatInclude }>;

async function toChatDTO(db: Tx, chat: ChatWithRelations, viewerId: string): Promise<ChatDTO> {
  const me = chat.members.find((m) => m.userId === viewerId);
  if (!me) throw new AppError("CHAT_NOT_FOUND");
  const overrides = await loadOverrides(
    db,
    viewerId,
    chat.members.filter((m) => m.userId !== viewerId).map((m) => m.userId),
  );
  const members = chat.members.map((m) => ({ ...m, shown: applyOverride(toPublicUser(m.user), overrides.get(m.userId)) }));
  const others = members.filter((m) => m.userId !== viewerId);

  const visible = { chatId: chat.id, ...visibleTo(viewerId, me.clearedAt) };
  const readFloor = [me.lastReadAt, me.clearedAt].filter((d): d is Date => d !== null).sort((a, b) => +b - +a)[0];
  const [lastMessage, unreadCount] = await Promise.all([
    db.message.findFirst({ where: visible, orderBy: newestFirst, include: messageInclude }),
    db.message.count({
      where: {
        ...visible,
        senderId: { not: viewerId },
        deletedAt: null,
        ...(readFloor && { createdAt: { gt: readFloor } }),
      },
    }),
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
    lastMessage: lastMessage ? toMessageDTO(lastMessage) : null,
    unreadCount,
    archived: me.archived,
    muted: me.muted,
    pinned: me.pinned,
    autoDeleteSecs: me.autoDeleteSecs,
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
      messages: { some: {} },
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
    const members = await tx.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
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

export async function updateChat(userId: string, chatId: string, input: UpdateChatInput) {
  return withEvents(async (tx, emit) => {
    await assertMember(tx, chatId, userId);
    await tx.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: input });
    const dto = await getChat(userId, chatId, tx);
    emit(userId, "chat.updated", dto);
    return dto;
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
