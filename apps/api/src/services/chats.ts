import type { Prisma } from "@prisma/client";
import { AppError, type ChatDTO, type ChatListQuery, type ChatReadDTO, type MarkReadInput } from "@six/shared";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { assertMember, toMessageDTO } from "./messages.js";
import { toPublicUser } from "./users.js";

const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }];

const chatInclude = {
  members: { include: { user: true }, orderBy: { joinedAt: "asc" } },
  messages: { orderBy: newestFirst, take: 1 },
} satisfies Prisma.ChatInclude;

type ChatWithRelations = Prisma.ChatGetPayload<{ include: typeof chatInclude }>;

async function toChatDTO(db: Tx, chat: ChatWithRelations, viewerId: string): Promise<ChatDTO> {
  const me = chat.members.find((m) => m.userId === viewerId);
  if (!me) throw new AppError("CHAT_NOT_FOUND");
  const others = chat.members.filter((m) => m.userId !== viewerId);

  const unreadCount = await db.message.count({
    where: {
      chatId: chat.id,
      senderId: { not: viewerId },
      ...(me.lastReadAt && { createdAt: { gt: me.lastReadAt } }),
    },
  });

  return {
    id: chat.id,
    type: "direct",
    title: others.map((m) => m.user.displayName).join(", ") || "Just you",
    members: chat.members.map((m) => ({
      user: toPublicUser(m.user),
      lastReadMessageId: m.lastReadMessageId,
      lastReadAt: m.lastReadAt?.toISOString() ?? null,
    })),
    lastMessage: chat.messages[0] ? toMessageDTO(chat.messages[0]) : null,
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
      members: { some: { userId, archived: q.archived } },
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

export async function markRead(userId: string, chatId: string, input: MarkReadInput): Promise<ChatReadDTO | null> {
  return withEvents(async (tx, emit) => {
    const member = await assertMember(tx, chatId, userId);
    const target = input.messageId
      ? await tx.message.findFirst({ where: { id: input.messageId, chatId } })
      : await tx.message.findFirst({ where: { chatId }, orderBy: newestFirst });
    if (input.messageId && !target) throw new AppError("MESSAGE_NOT_FOUND");
    if (!target || (member.lastReadAt && member.lastReadAt >= target.createdAt)) return null;

    await tx.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { lastReadMessageId: target.id, lastReadAt: target.createdAt },
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
