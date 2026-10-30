import { AppError } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";

/**
 * Your chat with support, answered by the first admin in ADMIN_EMAILS who has an account. A new one stays out
 * of the admin's chat list until you write, so signing in to the support page alone doesn't fill it up.
 */
export async function openSupportChat(userId: string) {
  const admins = await prisma.user.findMany({
    where: {
      OR: env.ADMIN_EMAILS.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })),
      deletedAt: null,
      bannedAt: null,
    },
    select: { id: true, email: true },
  });
  const agent = env.ADMIN_EMAILS.map((e) => admins.find((a) => a.email.toLowerCase() === e)).find(Boolean);
  if (!agent) throw new AppError("NOT_FOUND", "Support isn't available right now");
  if (agent.id === userId) throw new AppError("VALIDATION_FAILED", "You are support");
  const directKey = [agent.id, userId].sort().join(":");
  const chat = await prisma.chat.upsert({
    where: { directKey },
    create: { directKey, members: { create: [{ userId: agent.id, hidden: true }, { userId }] } },
    update: {},
  });
  return getChat(userId, chat.id);
}
