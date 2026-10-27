import { AppError, type BlockedUserDTO } from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { getChat } from "./chats.js";
import { profilesFor } from "./contacts.js";

const directKey = (a: string, b: string) => [a, b].sort().join(":");

/** Whether `userId` blocked `otherId`, and the other way round. */
export async function blockState(db: Tx, userId: string, otherId: string) {
  const rows = await db.block.findMany({
    where: {
      OR: [
        { blockerId: userId, blockedId: otherId },
        { blockerId: otherId, blockedId: userId },
      ],
    },
    select: { blockerId: true },
  });
  return { byMe: rows.some((r) => r.blockerId === userId), byThem: rows.some((r) => r.blockerId === otherId) };
}

/** Everyone `userId` blocked or was blocked by. */
export async function blockedWith(db: Tx, userId: string) {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/**
 * Refuses to post into a chat where either person blocked the other or the other person deleted
 * their account. Covers sending, scheduled sends, edits, reactions and timer or theme changes.
 */
export async function assertCanMessage(db: Tx, chatId: string, userId: string) {
  const others = await db.chatMember.findMany({
    where: { chatId, userId: { not: userId } },
    select: { user: { select: { id: true, deletedAt: true } } },
  });
  if (others.some((m) => m.user.deletedAt)) throw new AppError("ACCOUNT_DELETED", "This account was deleted");
  for (const { user } of others) {
    const state = await blockState(db, userId, user.id);
    if (state.byMe) throw new AppError("CHAT_BLOCKED", "You blocked this person. Unblock them to send messages.");
    if (state.byThem) throw new AppError("CHAT_BLOCKED", "This person blocked you");
  }
}

async function directChatWith(db: Tx, userId: string, otherId: string) {
  if (userId === otherId) throw new AppError("VALIDATION_FAILED", "You can't block yourself");
  const chat = await db.chat.findUnique({ where: { directKey: directKey(userId, otherId) }, select: { id: true } });
  if (!chat) throw new AppError("USER_NOT_FOUND");
  return chat.id;
}

async function setBlocked(userId: string, otherId: string, blocked: boolean) {
  await withEvents(async (tx, emit) => {
    const chatId = await directChatWith(tx, userId, otherId);
    const key = { blockerId: userId, blockedId: otherId };
    if (blocked) await tx.block.upsert({ where: { blockerId_blockedId: key }, create: key, update: {} });
    else await tx.block.deleteMany({ where: key });
    for (const id of [userId, otherId]) emit(id, "chat.updated", await getChat(id, chatId, tx));
  });
  if (blocked) {
    const hidden = (userId: string) => ({ userId, online: false, lastSeenAt: null });
    broadcaster().to(rooms.user(userId)).emit("presence", hidden(otherId));
    broadcaster().to(rooms.user(otherId)).emit("presence", hidden(userId));
  }
}

/** Blocks someone you share a chat with. They see that they were blocked. */
export const blockUser = (userId: string, otherId: string) => setBlocked(userId, otherId, true);

export const unblockUser = (userId: string, otherId: string) => setBlocked(userId, otherId, false);

export async function listBlocked(userId: string): Promise<{ items: BlockedUserDTO[] }> {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    include: { blocked: true },
    orderBy: { createdAt: "desc" },
  });
  const shown = await profilesFor(prisma, userId, rows.map((r) => r.blockedId));
  return { items: rows.map((r) => ({ user: shown(r.blocked), createdAt: r.createdAt.toISOString() })) };
}
