import { AppError, facebookOnly } from "@six/shared";
import { env } from "../env.js";
import { withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";
import { assertMember } from "./messages.js";

/**
 * Your chat with support, answered by the first admin in ADMIN_EMAILS who has an account. It's a chat of its own,
 * apart from any personal chat with that admin, and shows them to you as Six Frites. A new one stays out of the
 * admin's chat list until you write, so signing in to the support page alone doesn't fill it up.
 */
export async function openSupportChat(userId: string) {
  const admins = await prisma.user.findMany({
    where: {
      OR: env.ADMIN_EMAILS.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
      deletedAt: null,
      bannedAt: null,
    },
    select: { id: true, email: true, providers: true },
  });
  const agent = env.ADMIN_EMAILS.map((e) => admins.find((a) => a.email.toLowerCase() === e && !facebookOnly(a.providers))).find(Boolean);
  if (!agent) throw new AppError("NOT_FOUND", "Support isn't available right now");
  if (agent.id === userId) throw new AppError("VALIDATION_FAILED", "You are support");
  const directKey = `support:${userId}`;
  const chat = await prisma.chat.upsert({
    where: { directKey },
    create: { directKey, supportUserId: userId, members: { create: [{ userId: agent.id, hidden: true }, { userId }] } },
    update: {},
  });
  return getChat(userId, chat.id);
}

/** Support closes a conversation: it moves to their archive, and comes back open when either side writes. */
export async function closeSupportChat(userId: string, chatId: string) {
  return withEvents(async (tx, emit) => {
    await assertMember(tx, chatId, userId);
    const chat = await tx.chat.findUniqueOrThrow({ where: { id: chatId }, include: { members: true } });
    if (!chat.supportUserId || chat.supportUserId === userId) throw new AppError("FORBIDDEN", "Only support can close this chat");
    await tx.chat.update({ where: { id: chatId }, data: { supportClosedAt: new Date() } });
    await tx.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { archived: true } });
    for (const m of chat.members) emit(m.userId, "chat.updated", await getChat(m.userId, chatId, tx));
    return getChat(userId, chatId, tx);
  });
}
