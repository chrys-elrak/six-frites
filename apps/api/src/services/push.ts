import {
  type Dict,
  type LiveGame,
  type PublicUser,
  type PushPayload,
  type PushProvider,
  type RegisterPushTokenInput,
  dict,
  isLocale,
  previewText,
  reactionText,
} from "@six/shared";
import { env } from "../env.js";
import { activeSessions } from "../lib/presence.js";
import { prisma } from "../lib/prisma.js";
import { pushQueue } from "../lib/queue.js";
import { pushProviders } from "../push/providers.js";
import { profilesFor } from "./contacts.js";
import { supportCase } from "./users.js";
import { messageInclude, toMessageDTO } from "./messages.js";
import { memberMuted, supportProfile } from "./chats.js";

/** Delay before pushing, so a message read straight away in an open app doesn't also buzz a phone. */
export const PUSH_DELAY_MS = 3000;

export function pushConfig() {
  return { webPushPublicKey: env.WEB_PUSH_PUBLIC_KEY ?? null };
}

export async function registerPushToken(sessionId: string, input: RegisterPushTokenInput) {
  await prisma.pushToken.upsert({
    where: { sessionId_provider: { sessionId, provider: input.provider } },
    create: { sessionId, provider: input.provider, token: input.token, locale: input.locale },
    update: { token: input.token, locale: input.locale ?? "en" },
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

/** Whether `userId` is the person being helped in this chat with support, who sees the other side as Six Frites. */
/** Someone as `userId` sees them in a chat: support is Six Frites to whoever it helps, and they are a Potato to support. */
async function seenIn(chatId: string, userId: string, person: Parameters<Awaited<ReturnType<typeof profilesFor>>>[0]) {
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { supportUserId: true } });
  if (chat?.supportUserId === userId) return supportProfile(person.id);
  const shown = (await profilesFor(prisma, userId, [person.id]))(person);
  return chat?.supportUserId === person.id ? supportCase(shown, userId) : shown;
}

async function targetsFor(userId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, pushTokens: { some: {} } },
    include: { pushTokens: true, user: { select: { locale: true } } },
  });
  const active = await activeSessions(sessions.map((s) => s.id));
  return sessions
    .filter((s) => !active.has(s.id))
    .flatMap((s) => s.pushTokens.map((t) => ({ ...t, locale: s.user.locale ?? t.locale })));
}

async function sendToAll(targets: Awaited<ReturnType<typeof targetsFor>>, payload: (t: Dict) => PushPayload) {
  const providers = pushProviders();
  let sent = 0;
  for (const t of targets) {
    const provider = providers[t.provider as PushProvider];
    if (!provider) continue;
    const body = payload(dict[isLocale(t.locale) ? t.locale : "en"]);
    if ((await provider.send(t.token, body)) === "gone") await prisma.pushToken.delete({ where: { id: t.id } });
    else sent++;
  }
  return sent;
}

/**
 * Sends one recipient a notification for a message, unless it was sent silently, the chat is muted or
 * archived for them, they already read it, or the device is in active use. Returns how many devices were notified.
 */
export async function deliverPush(messageId: string, userId: string) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: { ...messageInclude, sender: true } });
  if (!m || m.silent || m.deletedAt || m.expiredAt || m.senderId === userId) return 0;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId } } });
  if (!member || memberMuted(member) || member.archived || member.hidden) return 0;
  if (member.lastReadAt && member.lastReadAt >= m.createdAt) return 0;

  const targets = await targetsFor(userId);
  if (!targets.length) return 0;

  const sender = await seenIn(m.chatId, userId, m.sender);
  const dto = toMessageDTO(m, userId);
  return sendToAll(targets, (t) => ({
    title: sender.displayName,
    body: previewText(dto, t) || t.summary.newMessage,
    icon: sender.avatarUrl,
    chatId: m.chatId,
    messageId: m.id,
    url: `/chats/${m.chatId}`,
  }));
}

/**
 * Tells the author of a message about a reaction that is still there, unless the chat is muted or archived
 * for them or they're using the app.
 */
export async function deliverReactionPush(
  messageId: string,
  userId: string,
  { emoji, reactorId }: { emoji: string; reactorId: string },
) {
  const m = await prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
  if (!m || m.deletedAt || m.purgedAt || m.senderId !== userId) return 0;
  if (!m.reactions.some((r) => r.userId === reactorId && r.emoji === emoji)) return 0;

  const member = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId } } });
  if (!member || memberMuted(member) || member.archived || member.hidden) return 0;

  const targets = await targetsFor(userId);
  if (!targets.length) return 0;

  const reactor = await prisma.user.findUnique({ where: { id: reactorId } });
  if (!reactor) return 0;
  const who = await seenIn(m.chatId, userId, reactor);
  const dto = toMessageDTO(m, userId);
  return sendToAll(targets, (t) => ({
    title: who.displayName,
    body: reactionText(emoji, dto, t),
    icon: who.avatarUrl,
    chatId: m.chatId,
    messageId: m.id,
    url: `/chats/${m.chatId}`,
  }));
}

/** Asks a contact to join a live game, on the devices they aren't using right now. */
export async function deliverLiveInvitePush(userId: string, from: PublicUser, game: LiveGame, roomId: string) {
  const targets = await targetsFor(userId);
  return sendToAll(targets, (t) => ({
    title: t.live.invites(from.displayName, t.live.games[game]),
    body: t.live.tapToJoin,
    icon: from.avatarUrl,
    chatId: null,
    messageId: null,
    url: `/play/${roomId}`,
  }));
}

/**
 * Tells the sender that `fromId` can't read their message and asks for it again, or tells whoever asked
 * that the sender can't send it again, on the devices they aren't using.
 */
export async function deliverResealPush(
  m: { id: string; chatId: string },
  userId: string,
  fromId: string,
  kind: "requested" | "failed",
) {
  const targets = await targetsFor(userId);
  if (!targets.length) return 0;
  const from = await seenIn(m.chatId, userId, await prisma.user.findUniqueOrThrow({ where: { id: fromId } }));
  return sendToAll(targets, (t) => ({
    title: from.displayName,
    body: kind === "requested" ? t.messages.resendRequestedPush : t.messages.resendFailedPush,
    icon: from.avatarUrl,
    chatId: m.chatId,
    messageId: m.id,
    url: `/chats/${m.chatId}`,
  }));
}

/** Shows someone an anonymous message they just got, on the devices they aren't using right now. */
export async function deliverAnonPush(userId: string, text: string, kind: "image" | "gif" | "voice") {
  const targets = await targetsFor(userId);
  return sendToAll(targets, (t) => ({
    title: t.ask.newMessage,
    body: text || { image: `📷 ${t.summary.kinds.image}`, gif: t.summary.kinds.gif, voice: `🎤 ${t.summary.kinds.voice}` }[kind],
    icon: null,
    chatId: null,
    messageId: null,
    url: "/inbox",
  }));
}

/** Tells someone a contact reacted to their story, on the devices they aren't using right now. */
export async function deliverStoryReactionPush(userId: string, from: PublicUser, emoji: string, note = false) {
  const targets = await targetsFor(userId);
  return sendToAll(targets, (t) => ({
    title: from.displayName,
    body: `${emoji} ${note ? t.stories.reactedToYourNote : t.stories.reactedToYours}`,
    icon: from.avatarUrl,
    chatId: null,
    messageId: null,
    url: "/",
  }));
}

/** Tells every signed-in Android phone that a new version of the app is out. */
export async function deliverReleasePush(version: string, downloadUrl: string) {
  const targets = await prisma.pushToken.findMany({
    where: { provider: "fcm", session: { revokedAt: null, expiresAt: { gt: new Date() } } },
  });
  return sendToAll(targets, (t) => ({
    title: t.common.newVersion(version),
    body: t.common.tapToUpdate,
    icon: null,
    chatId: null,
    messageId: null,
    url: downloadUrl,
  }));
}
