import { createId } from "@paralleldrive/cuid2";
import { type BotGame, FRITE_BOT_ID, type LiveGame, type Locale, botGame, dict, isLocale } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";
import { withEvents } from "../lib/events.js";
import { createMessage, messageInclude, sendMessage, toMessageDTO } from "./messages.js";

const directKey = (userId: string) => [userId, FRITE_BOT_ID].sort().join(":");

async function botChatId(userId: string) {
  const chat = await prisma.chat.findUnique({ where: { directKey: directKey(userId) }, select: { id: true } });
  return chat?.id ?? null;
}

/**
 * The user's chat with Frite Bot, made the first time with a hello in their language. `open` brings it back to the chat
 * list after they deleted it for themselves; otherwise a hidden one stays hidden.
 */
export async function openBotChat(userId: string, locale: Locale, open: boolean) {
  const avatarUrl = `${env.WEB_ORIGIN}/frite-bot.svg`;
  await prisma.user.upsert({
    where: { id: FRITE_BOT_ID },
    create: { id: FRITE_BOT_ID, googleSub: FRITE_BOT_ID, email: "frite-bot@bots.six-frites.invalid", displayName: dict.en.calls.bot, avatarUrl },
    update: { displayName: dict.en.calls.bot, avatarUrl },
  });
  await prisma.user.update({ where: { id: userId }, data: { locale } });
  let chatId = await botChatId(userId);
  if (!chatId) {
    const chat = await prisma.chat
      .create({ data: { directKey: directKey(userId), members: { create: [{ userId: FRITE_BOT_ID, showProfile: true }, { userId }] } } })
      .catch(() => null);
    chatId = chat?.id ?? (await botChatId(userId))!;
    await sendMessage(FRITE_BOT_ID, chatId, { clientId: `hello:${userId}`, text: dict[locale].calls.botIntro });
  } else if (open) {
    await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { hidden: false } });
  }
  return getChat(userId, chatId);
}

/** Frite Bot sends a new game of `kind` to the user's chat with it, the way it plays them on the phone. */
export async function startBotGame(userId: string, kind: BotGame, locale: Locale) {
  const chatId = (await botChatId(userId)) ?? (await openBotChat(userId, locale, true)).id;
  const sent = await sendMessage(FRITE_BOT_ID, chatId, { clientId: createId(), game: botGame(kind, locale) });
  return toMessageDTO(await prisma.message.findUniqueOrThrow({ where: { id: sent.id }, include: messageInclude }), userId);
}

/** Posts a live game I play alone with the bot in our chat, so its Join link brings me back after I leave. */
export async function postBotLiveGame(userId: string, locale: Locale, game: LiveGame, roomId: string) {
  const chatId = (await botChatId(userId)) ?? (await openBotChat(userId, locale, true)).id;
  const action = { type: "live_invite" as const, game, roomId, from: dict[locale].calls.bot };
  await withEvents((tx, emit) => createMessage(tx, emit, FRITE_BOT_ID, chatId, { clientId: createId(), action, silent: true }));
}

/** Tells me in our chat how a live game I played alone against the bot ended. */
export async function postBotLiveResult(
  userId: string,
  locale: Locale,
  game: LiveGame,
  result: "won" | "lost" | "draw",
  score?: number[],
) {
  const chatId = (await botChatId(userId)) ?? (await openBotChat(userId, locale, true)).id;
  const action = { type: "live_result" as const, game, result, ...(score && { score }) };
  await withEvents((tx, emit) => createMessage(tx, emit, FRITE_BOT_ID, chatId, { clientId: createId(), action, silent: true }));
}

/** Frite Bot answers a text with a nudge towards the games, in the user's language. */
export async function botReply(userId: string, chatId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const locale = user?.locale && isLocale(user.locale) ? user.locale : "en";
  await sendMessage(FRITE_BOT_ID, chatId, { clientId: createId(), text: dict[locale].calls.botReply });
}
