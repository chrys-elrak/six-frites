import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ANON_VOICE_MS,
  type AdminAnonQuery,
  AppError,
  type AnonMessageDTO,
  type AskLinkDTO,
  type AskProfileDTO,
  type CreateTempLinkInput,
  type PageQuery,
  type SendAnonInput,
  type SentAnonDTO,
  TEMP_LINK_MAX,
  type TempLinkDTO,
  type UpdateAskProfileInput,
  isLocale,
  maskSpoilers,
} from "@six/shared";
import type { AnonMessage, User } from "../generated/prisma/client.js";
import { BOT_LINES } from "../lib/bot-lines.js";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { ffmpeg, probe, waveform } from "../media/ffmpeg.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { parsePhoto } from "./contacts.js";
import { sharedGif } from "./gifs.js";
import { EPHEMERAL_LINK_SECONDS, entitiesOf, storedEntities } from "./messages.js";
import { deliverAnonPush } from "./push.js";
import { toUserRef } from "./reports.js";
import { toUserDTO } from "./users.js";

const toAnonDTO = (m: AnonMessage, renewedAt?: Date | null): AnonMessageDTO => ({
  id: m.id,
  text: m.text,
  prompt: m.prompt,
  entities: entitiesOf(m),
  photoUrl: m.photoKey ? presignGet(m.photoKey) : null,
  gif: m.gifKey ? { url: presignGet(m.gifKey), width: m.gifWidth, height: m.gifHeight } : null,
  voice: m.voiceKey ? { url: presignGet(m.voiceKey), durationMs: m.voiceMs ?? 0, waveform: m.voiceWaveform } : null,
  createdAt: m.createdAt.toISOString(),
  oldLink: !!renewedAt && m.createdAt < renewedAt,
  bot: m.senderId === null,
});

/**
 * Whose link this is, their own or a temporary one that hasn't expired, and the prompt it shows: the temporary
 * link's title, else the user's own prompt.
 */
async function askerByCode(code: string) {
  const askCode = code.toUpperCase();
  const alive = { deletedAt: null, OR: [{ bannedAt: null }, { banScope: "chat" }] };
  const user = await prisma.user.findFirst({ where: { askCode, ...alive } });
  if (user) return { user, prompt: user.askPrompt };
  const link = await prisma.askLink.findFirst({
    where: { code: askCode, expiresAt: { gt: new Date() }, user: alive },
    include: { user: true },
  });
  if (!link) throw new AppError("USER_NOT_FOUND", "This link doesn't work anymore");
  return { user: link.user, prompt: link.prompt ?? link.user.askPrompt };
}

export async function listTempLinks(userId: string): Promise<TempLinkDTO[]> {
  const rows = await prisma.askLink.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((l) => ({ code: l.code, prompt: l.prompt, expiresAt: l.expiresAt.toISOString() }));
}

// ponytail: expired temporary links stay in the table; sweep them in the timers worker if it ever grows
/** A second link to your messages, with its own title, that stops working after `hours`; your own link doesn't change. */
export async function createTempLink(userId: string, { prompt, hours }: CreateTempLinkInput): Promise<TempLinkDTO> {
  const active = await prisma.askLink.count({ where: { userId, expiresAt: { gt: new Date() } } });
  if (active >= TEMP_LINK_MAX) throw new AppError("CONFLICT", `You can have ${TEMP_LINK_MAX} temporary links at once`);
  const expiresAt = new Date(Date.now() + hours * HOUR);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    if (await prisma.user.findFirst({ where: { askCode: code }, select: { id: true } })) continue;
    try {
      await prisma.askLink.create({ data: { userId, code, prompt, expiresAt } });
      return { code, prompt, expiresAt: expiresAt.toISOString() };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique link");
}

export async function deleteTempLink(userId: string, code: string) {
  await prisma.askLink.deleteMany({ where: { userId, code: code.toUpperCase() } });
}

/**
 * How someone looks on their link: the name they picked, else their account name, only a photo they picked for
 * it, and their own prompt if they wrote one.
 */
const toAskProfile = (u: User): AskProfileDTO => ({
  displayName: u.askName ?? u.displayName,
  avatarUrl: u.askAvatarKey ? presignGet(u.askAvatarKey) : null,
  prompt: u.askPrompt,
});

/** Whether `recipientId` blocked this sender, or another account that signed in on one of the sender's devices. */
async function isAnonBlocked(recipientId: string, senderId: string) {
  const devices = await prisma.session.findMany({
    where: { userId: senderId, deviceId: { not: null } },
    select: { deviceId: true },
    distinct: ["deviceId"],
  });
  const block = await prisma.anonBlock.findFirst({
    where: {
      blockerId: recipientId,
      OR: [
        { blockedId: senderId },
        { blocked: { sessions: { some: { deviceId: { in: devices.map((d) => d.deviceId!) } } } } },
      ],
    },
    select: { blockerId: true },
  });
  return !!block;
}

/** The link's public face, and whether the signed-in viewer, if any, was blocked from it. */
export async function askLink(code: string, viewerId?: string): Promise<AskLinkDTO> {
  const { user, prompt } = await askerByCode(code);
  return { ...toAskProfile(user), prompt, blocked: !!viewerId && (await isAnonBlocked(user.id, viewerId)) };
}

export async function updateAskProfile(userId: string, input: UpdateAskProfileInput) {
  let askAvatarKey: string | null | undefined = input.photo === null ? null : undefined;
  if (input.photo) {
    const p = parsePhoto(input.photo);
    askAvatarKey = `q/${userId}/${randomUUID()}.${p.ext}`;
    await putObject(askAvatarKey, p.bytes, p.mime);
  }
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { askAvatarKey: true } });
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined && { askName: input.name || null }),
      ...(input.prompt !== undefined && { askPrompt: input.prompt || null }),
      askAvatarKey,
    },
  });
  if (before.askAvatarKey && askAvatarKey !== undefined) await deleteObjects([before.askAvatarKey]).catch(() => null);
  return toAskProfile(user);
}

/** Gives the user a new link; the old one stops working. */
export async function resetAskCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { askCode: generateCode(), askRenewedAt: new Date() } }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique link");
}

const HOUR = 60 * 60 * 1000;

/**
 * How many anonymous messages one person can send in an hour, to the same link and to anyone, and to how many
 * other people a day the same text of at least `copyMinLength` characters can go.
 */
export const SEND_LIMITS = { perRecipient: 5, total: 30, sameText: 3, copyMinLength: 20 };

/**
 * Turns away a sender who has hit the hourly limits, already sent this text to this person today, or is pasting
 * the same longer text to one link after another.
 */
async function assertNotSpam(senderId: string, recipientId: string, text: string) {
  const since = new Date(Date.now() - HOUR);
  const sameText = { senderId, text: { equals: text, mode: "insensitive" as const }, createdAt: { gte: new Date(Date.now() - 24 * HOUR) } };
  const [toThem, total, repeat, copies] = await Promise.all([
    prisma.anonMessage.count({ where: { senderId, recipientId, createdAt: { gte: since } } }),
    prisma.anonMessage.count({ where: { senderId, createdAt: { gte: since } } }),
    text && prisma.anonMessage.findFirst({ where: { ...sameText, recipientId }, select: { id: true } }),
    text.length >= SEND_LIMITS.copyMinLength
      ? prisma.anonMessage.findMany({
          where: { ...sameText, recipientId: { not: recipientId } },
          distinct: ["recipientId"],
          select: { recipientId: true },
          take: SEND_LIMITS.sameText,
        })
      : [],
  ]);
  if (toThem >= SEND_LIMITS.perRecipient || total >= SEND_LIMITS.total) {
    throw new AppError("RATE_LIMITED", "Too many anonymous messages; try again later");
  }
  if (repeat) throw new AppError("CONFLICT", "You already sent this message");
  if (copies.length >= SEND_LIMITS.sameText) throw new AppError("CONFLICT", "You already sent this message to other people");
}

/**
 * Re-encodes a voice message to AAC, keeping its first `maxMs` and none of its metadata, and stores it under
 * `folder`: the recipient's, like a photo, for an anonymous message.
 */
export async function storeVoice(folder: string, bytes: Buffer, maxMs: number) {
  const dir = await mkdtemp(join(tmpdir(), "anon-voice-"));
  try {
    const input = join(dir, "input");
    const out = join(dir, "voice.m4a");
    await writeFile(input, bytes);
    await ffmpeg([
      ...["-i", input, "-t", String(maxMs / 1000), "-vn", "-map_metadata", "-1"],
      ...["-c:a", "aac", "-b:a", "48k", "-ac", "1", "-movflags", "+faststart", out],
    ]);
    const info = await probe(out);
    if (!info.hasAudio || !info.durationMs) throw new Error("no sound");
    const key = `x/${folder}/${randomUUID()}.m4a`;
    await putObject(key, await readFile(out), "audio/mp4");
    return { key, durationMs: Math.min(info.durationMs, maxMs), waveform: await waveform(out) };
  } catch {
    throw new AppError("VALIDATION_FAILED", "Couldn't read that voice message");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Sends an anonymous message. Someone the recipient blocked is told so: a quiet block would let the recipient
 * unmask a suspect by asking them for a test message and watching it never arrive. A photo is stored under the
 * recipient, so its address says nothing about who sent it.
 */
export async function sendAnon(senderId: string, code: string, { text, entities, photo, gifId, voice }: SendAnonInput) {
  const { user: recipient, prompt } = await askerByCode(code);
  if (await isAnonBlocked(recipient.id, senderId)) throw new AppError("ANON_BLOCKED", "This person isn't taking your messages");
  await assertNotSpam(senderId, recipient.id, text);
  let photoKey: string | null = null;
  if (photo) {
    const p = parsePhoto(photo);
    photoKey = `x/${recipient.id}/${randomUUID()}.${p.ext}`;
    await putObject(photoKey, p.bytes, p.mime);
  }
  const gif = gifId ? await sharedGif(gifId) : null;
  const sound = voice
    ? await storeVoice(recipient.id, Buffer.from(voice.slice(voice.indexOf(",") + 1), "base64"), ANON_VOICE_MS)
    : null;
  const m = await prisma.anonMessage.create({
    data: {
      recipientId: recipient.id,
      senderId,
      text,
      prompt,
      entities: storedEntities(entities),
      photoKey,
      gifKey: gif?.key,
      gifWidth: gif?.width,
      gifHeight: gif?.height,
      voiceKey: sound?.key,
      voiceMs: sound?.durationMs,
      voiceWaveform: sound?.waveform,
    },
  });
  broadcaster().to(rooms.user(recipient.id)).emit("ask:new", toAnonDTO(m));
  void deliverAnonPush(recipient.id, maskSpoilers(text, entities), sound ? "voice" : gif ? "gif" : "image").catch(() => null);
}

export async function listAnon(userId: string, q: PageQuery) {
  const [rows, { askRenewedAt }] = await Promise.all([
    prisma.anonMessage.findMany({ where: { recipientId: userId, recipientDeletedAt: null }, ...pageArgs(q) }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { askRenewedAt: true } }),
  ]);
  return toPage(rows, q, (m) => toAnonDTO(m, askRenewedAt));
}

/** What you sent, newest first, with whom you sent it to. Nothing says whether they deleted it. */
export async function listSent(userId: string, q: PageQuery) {
  const rows = await prisma.anonMessage.findMany({
    where: { senderId: userId, senderDeletedAt: null },
    include: { recipient: true },
    ...pageArgs(q),
  });
  return toPage(rows, q, (m): SentAnonDTO => ({ ...toAnonDTO(m), to: toAskProfile(m.recipient) }));
}

/** Hides a message from your inbox; it stays for the moderators. */
export async function deleteAnon(userId: string, id: string) {
  await prisma.anonMessage.updateMany({
    where: { id, recipientId: userId, recipientDeletedAt: null },
    data: { recipientDeletedAt: new Date() },
  });
}

/** Hides a message from your sent list; the recipient keeps it, and so do the moderators. */
export async function deleteSent(userId: string, id: string) {
  await prisma.anonMessage.updateMany({
    where: { id, senderId: userId, senderDeletedAt: null },
    data: { senderDeletedAt: new Date() },
  });
}

/** Stops this message's sender, and other accounts on their devices, from writing to you; hides the message; never says who. */
export async function blockAnonSender(userId: string, id: string) {
  const m = await prisma.anonMessage.findFirst({ where: { id, recipientId: userId, recipientDeletedAt: null } });
  if (!m) throw new AppError("MESSAGE_NOT_FOUND");
  if (!m.senderId) throw new AppError("VALIDATION_FAILED", "Six Frites sent this one; turn its questions off in your settings");
  await prisma.$transaction([
    prisma.anonBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: m.senderId } },
      create: { blockerId: userId, blockedId: m.senderId },
      update: {},
    }),
    prisma.anonMessage.update({ where: { id }, data: { recipientDeletedAt: new Date() } }),
  ]);
}

/** Every anonymous message, deleted ones too, with who sent it to whom: for the moderators. */
export async function listAnonForAdmin(q: AdminAnonQuery) {
  const match = { contains: q.q ?? "", mode: "insensitive" as const };
  const who = { OR: [{ email: match }, { displayName: match }] };
  const rows = await prisma.anonMessage.findMany({
    where: { senderId: { not: null }, ...(q.q && { OR: [{ sender: who }, { recipient: who }] }) },
    include: { sender: true, recipient: true },
    ...pageArgs(q),
  });
  return toPage(rows, q, (m) => ({
    id: m.id,
    text: m.text,
    photoUrl: m.photoKey ? presignGet(m.photoKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    gifUrl: m.gifKey ? presignGet(m.gifKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    voiceUrl: m.voiceKey ? presignGet(m.voiceKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    sender: toUserRef(m.sender!),
    recipient: toUserRef(m.recipient),
    createdAt: m.createdAt.toISOString(),
    senderDeletedAt: m.senderDeletedAt?.toISOString() ?? null,
    recipientDeletedAt: m.recipientDeletedAt?.toISOString() ?? null,
  }));
}

const DAY = 24 * HOUR;

// ponytail: everyone's night is Madagascar's (UTC+3); keep a timezone per user if people elsewhere join
/** When the bot next writes: 2 to 6 days on, at any minute, moved out of the night (22:00 to 8:00). */
export function nextBotAt(from = Date.now()) {
  const at = from + 2 * DAY + Math.random() * 4 * DAY;
  const hour = new Date(at + 3 * HOUR).getUTCHours();
  return new Date(hour < 8 || hour >= 22 ? at + 10 * HOUR : at);
}

/** Turns the bot's questions on or off; turned back on, it picks a new time. */
export async function setAnonBot(userId: string, on: boolean) {
  return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { anonBotDisabled: !on, anonBotAt: null } }));
}

/**
 * The bot's turn, from the worker's sweep: picks a time for whoever has none yet, then sends whoever's time came
 * a line they never got, in the language of their latest device. Once they got every line, it stays quiet.
 */
export async function sendDueBotAnon(batch = 100) {
  const reachable = { deletedAt: null, anonBotDisabled: false, OR: [{ bannedAt: null }, { banScope: "chat" }] };
  const fresh = await prisma.user.findMany({ where: { ...reachable, anonBotAt: null }, select: { id: true }, take: 1000 });
  for (const u of fresh) await prisma.user.update({ where: { id: u.id }, data: { anonBotAt: nextBotAt() } });

  const due = await prisma.user.findMany({
    where: { ...reachable, anonBotAt: { lte: new Date() } },
    select: { id: true, anonBotAt: true },
    take: batch,
  });
  let sent = 0;
  for (const u of due) {
    const claimed = await prisma.user.updateMany({ where: { id: u.id, anonBotAt: u.anonBotAt }, data: { anonBotAt: nextBotAt() } });
    if (claimed.count && (await sendBotLine(u.id))) sent++;
  }
  return sent;
}

async function sendBotLine(userId: string) {
  const [got, device] = await Promise.all([
    prisma.anonMessage.findMany({ where: { recipientId: userId, botLine: { not: null } }, select: { botLine: true } }),
    prisma.pushToken.findFirst({ where: { session: { userId } }, orderBy: { session: { lastUsedAt: "desc" } }, select: { locale: true } }),
  ]);
  const lines = BOT_LINES[isLocale(device?.locale) ? device.locale : "en"];
  const used = new Set(got.map((m) => m.botLine));
  const left = lines.flatMap((_, i) => (used.has(i) ? [] : [i]));
  if (!left.length) return false;
  const botLine = left[Math.floor(Math.random() * left.length)]!;
  const m = await prisma.anonMessage.create({ data: { recipientId: userId, text: lines[botLine]!, botLine } });
  broadcaster().to(rooms.user(userId)).emit("ask:new", toAnonDTO(m));
  await deliverAnonPush(userId, m.text, "image").catch(() => null);
  return true;
}
