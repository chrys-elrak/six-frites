import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { APP_ACCOUNT_IDS, type AnnounceInput, type BotGame, FRITE_BOT_ID, type LiveGame, type Locale, SIX_FRITES_ID, botGame, dict } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getChat } from "./chats.js";
import { withEvents } from "../lib/events.js";
import { emailAnnouncement } from "./emails.js";
import { createMessage, messageInclude, sendMessage, toMessageDTO } from "./messages.js";

const directKey = (userId: string, accountId = FRITE_BOT_ID) => [userId, accountId].sort().join(":");

async function botChatId(userId: string, accountId = FRITE_BOT_ID) {
  const chat = await prisma.chat.findUnique({ where: { directKey: directKey(userId, accountId) }, select: { id: true } });
  return chat?.id ?? null;
}

async function ensureAccount(id: string, profile: { displayName: string; avatarUrl: string }) {
  await prisma.user.upsert({
    where: { id },
    create: { id, googleSub: id, email: `${id}@bots.six-frites.invalid`, ...profile },
    update: profile,
  });
}

const ensureBot = () => ensureAccount(FRITE_BOT_ID, { displayName: dict.en.calls.bot, avatarUrl: `${env.WEB_ORIGIN}/frite-bot.svg` });

/**
 * The user's chat with Frite Bot, or with another of the app's accounts, made the first time. `open` brings it back if
 * they deleted it for themselves.
 */
async function botChat(userId: string, open: boolean, accountId = FRITE_BOT_ID) {
  let chatId = await botChatId(userId, accountId);
  if (!chatId) {
    const chat = await prisma.chat
      .create({
        data: { directKey: directKey(userId, accountId), members: { create: [{ userId: accountId, showProfile: true }, { userId }] } },
      })
      .catch(() => null);
    chatId = chat?.id ?? (await botChatId(userId, accountId))!;
  } else if (open) {
    await prisma.chatMember.update({ where: { chatId_userId: { chatId, userId } }, data: { hidden: false } });
  }
  return chatId;
}

export async function openBotChat(userId: string, locale: Locale, open: boolean) {
  await ensureBot();
  await prisma.user.update({ where: { id: userId }, data: { locale } });
  return getChat(userId, await botChat(userId, open));
}

/**
 * Posts `text` from Six Frites News in every member's chat with it, bringing that chat back for those who deleted it, so
 * it arrives like any message, with its notification. Guests, banned and waiting accounts can't open chats, so they
 * are left out. One member failing doesn't stop the others, and sending the same text again the same day only
 * reaches the members it missed; the same goes for the email, by its subject.
 *
 * ponytail: goes through members one by one inside the request, fine for a few hundred; move it to the timers queue
 * past a few thousand.
 */
export async function announce({ text, entities, email }: AnnounceInput) {
  await ensureAccount(SIX_FRITES_ID, { displayName: "Six Frites News", avatarUrl: `${env.WEB_ORIGIN.split(",")[0]}/six-frites-news.png` });
  const members = await prisma.user.findMany({
    where: { deletedAt: null, bannedAt: null, queuedAt: null, guest: false, id: { notIn: APP_ACCOUNT_IDS } },
    select: { id: true },
  });
  const day = new Date().toISOString().slice(0, 10);
  const key = createHash("sha256").update(`${day}:${text}:${JSON.stringify(entities ?? [])}`).digest("base64url").slice(0, 16);
  const chats = new Map<string, string>();
  let sent = 0;
  for (const { id } of members) {
    const ok = await botChat(id, false, SIX_FRITES_ID)
      .then((chatId) => {
        chats.set(id, chatId);
        return sendMessage(SIX_FRITES_ID, chatId, { clientId: `announce:${key}:${id}`, text, entities });
      })
      .then(
        () => true,
        (err: Error) => console.error(`announcement to ${id} failed:`, err.message),
      );
    if (ok) sent++;
  }
  const emails = email ? await emailAnnouncement(text, entities, email.subject, chats) : null;
  return { sent, members: members.length, emails };
}

/** Frite Bot sends a new game of `kind` to the user's chat with it, the way it plays them on the phone. */
export async function startBotGame(userId: string, kind: BotGame, locale: Locale) {
  const chatId = (await botChatId(userId)) ?? (await openBotChat(userId, locale, true)).id;
  const sent = await sendMessage(FRITE_BOT_ID, chatId, { clientId: createId(), game: botGame(kind, locale) });
  return toMessageDTO(await prisma.message.findUniqueOrThrow({ where: { id: sent.id }, include: messageInclude }), userId);
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
