import { AppError, type BlockedUserDTO } from "@six/shared";
import { type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { getChat } from "./chats.js";
import { profilesFor } from "./contacts.js";
import { notify } from "./notifications.js";

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
 * their account. Covers sending, scheduled sends, edits, reactions and timer or theme changes. A support chat stays
 * open whatever the blocks, so help is always one message away. In a group
 * that only admins write in, refuses members `writing` a message, but not their reactions or what the group
 * announces for them.
 */
export async function assertCanMessage(db: Tx, chatId: string, userId: string, writing = true) {
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { type: true, membersCanWrite: true, supportUserId: true } });
  if (chat?.type === "group") {
    if (!writing || chat.membersCanWrite) return;
    const me = await db.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, select: { role: true } });
    if (me?.role === "member") throw new AppError("GROUP_ADMINS_ONLY", "Only admins can send messages in this group");
    return;
  }
  if (chat?.supportUserId) return;
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

/** Refuses what only makes sense between two people, like calls or vanish mode, in a group. */
export async function assertDirect(db: Tx, chatId: string) {
  const chat = await db.chat.findUnique({ where: { id: chatId }, select: { type: true } });
  if (chat?.type === "group") throw new AppError("NOT_IN_GROUPS", "This isn't available in groups");
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
    else if ((await tx.block.deleteMany({ where: key })).count) {
      await notify(tx, emit, { userId: otherId, actorId: userId, kind: "unblocked", chatId });
    }
    for (const id of [userId, otherId]) emit(id, "chat.updated", await getChat(id, chatId, tx));
  });
  if (blocked) {
    const hidden = (userId: string) => ({ userId, online: false, devices: [], lastSeenAt: null, lastDevice: null });
    broadcaster().to(rooms.user(userId)).emit("presence", hidden(otherId));
    broadcaster().to(rooms.user(otherId)).emit("presence", hidden(userId));
  }
}

/** Blocks someone you share a chat with. They see that they were blocked. */
export const blockUser = (userId: string, otherId: string) => setBlocked(userId, otherId, true);

/** Unblocks someone, and tells them they can write again. */
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
