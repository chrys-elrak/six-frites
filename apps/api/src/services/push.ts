import { type PushPayload, type RegisterPushTokenInput, previewText, reactionText, type PushProvider } from "@six/shared";
import { env } from "../env.js";
import { activeSessions } from "../lib/presence.js";
import { prisma } from "../lib/prisma.js";
import { pushQueue } from "../lib/queue.js";
import { pushProviders } from "../push/providers.js";
import { applyOverride, loadOverrides } from "./contacts.js";
import { messageInclude, toMessageDTO } from "./messages.js";
import { toPublicUser } from "./users.js";

/** Delay before pushing, so a message read straight away in an open app doesn't also buzz a phone. */
export const PUSH_DELAY_MS = 3000;

export function pushConfig() {
  return { webPushPublicKey: env.WEB_PUSH_PUBLIC_KEY ?? null };
}

export async function registerPushToken(sessionId: string, input: RegisterPushTokenInput) {
  await prisma.pushToken.upsert({
    where: { sessionId_provider: { sessionId, provider: input.provider } },
    create: { sessionId, provider: input.provider, token: input.token },
    update: { token: input.token },
  });
}

export async function removePushToken(sessionId: string, provider: PushProvider) {
  await prisma.pushToken.deleteMany({ where: { sessionId, provider } });
}

export async function queuePush(messageId: string, recipientIds: string[], round = "") {
  if (!recipientIds.length) return;
  await pushQueue().addBulk(
    recipientIds.map((userId) => ({
      name: "message",
      data: { messageId, userId },
      opts: { delay: PUSH_DELAY_MS, jobId: `push-${messageId}-${userId}${round && `-${round}`}` },
    })),
  );
}

/**
 * Queues a push telling the author of a message that someone reacted to it. Delayed like message
 * pushes; a reaction taken back before then sends nothing.
 */
export async function queueReactionPush(messageId: string, authorId: string, reactorId: string, emoji: string) {
  if (authorId === reactorId) return;
  await pushQueue().add(
    "reaction",
    { messageId, userId: authorId, reaction: { emoji, reactorId } },
    { delay: PUSH_DELAY_MS, jobId: `react-${messageId}-${reactorId}-${Buffer.from(emoji).toString("hex")}` },
  );
}

async function targetsFor(userId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, pushTokens: { some: {} } },
    include: { pushTokens: true },
  });
  const active = await activeSessions(sessions.map((s) => s.id));
  return sessions.filter((s) => !active.has(s.id)).flatMap((s) => s.pushTokens);
}

async function sendToAll(targets: Awaited<ReturnType<typeof targetsFor>>, payload: PushPayload) {
  const providers = pushProviders();
  let sent = 0;
  for (const t of targets) {
    const provider = providers[t.provider as PushProvider];
    if (!provider) continue;
    if ((await provider.send(t.token, payload)) === "gone") await prisma.pushToken.delete({ where: { id: t.id } });
    else sent++;
  }
  return sent;
}

/**
 * Sends one recipient a notification for a message, unless the chat is muted for them, they already
 * read it, or the device is in active use. Returns how many devices were notified.
 */
export async function deliverPush(messageId: string, userId: string) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: { ...messageInclude, sender: true } });
  if (!m || m.deletedAt || m.expiredAt || m.senderId === userId) return 0;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId } } });
  if (!member || member.muted || member.hidden) return 0;
  if (member.lastReadAt && member.lastReadAt >= m.createdAt) return 0;

  const targets = await targetsFor(userId);
  if (!targets.length) return 0;

  const overrides = await loadOverrides(prisma, userId, [m.senderId]);
  const sender = applyOverride(toPublicUser(m.sender), overrides.get(m.senderId));
  return sendToAll(targets, {
    title: sender.displayName,
    body: previewText(toMessageDTO(m, userId)) || "New message",
    icon: sender.avatarUrl,
    chatId: m.chatId,
    messageId: m.id,
    url: `/chats/${m.chatId}`,
  });
}

/** Tells the author of a message about a reaction that is still there, unless the chat is muted or they're using the app. */
export async function deliverReactionPush(
  messageId: string,
  userId: string,
  { emoji, reactorId }: { emoji: string; reactorId: string },
) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  if (!m || m.deletedAt || m.purgedAt || m.senderId !== userId) return 0;
  if (!m.reactions.some((r) => r.userId === reactorId && r.emoji === emoji)) return 0;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId } } });
  if (!member || member.muted || member.hidden) return 0;

  const targets = await targetsFor(userId);
  if (!targets.length) return 0;

  const reactor = await prisma.user.findUnique({ where: { id: reactorId } });
  if (!reactor) return 0;
  const overrides = await loadOverrides(prisma, userId, [reactorId]);
  const who = applyOverride(toPublicUser(reactor), overrides.get(reactorId));
  return sendToAll(targets, {
    title: who.displayName,
    body: reactionText(emoji, toMessageDTO(m, userId)),
    icon: who.avatarUrl,
    chatId: m.chatId,
    messageId: m.id,
    url: `/chats/${m.chatId}`,
  });
}
