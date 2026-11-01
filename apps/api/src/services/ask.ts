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
  type PageQuery,
  type SendAnonInput,
  type SentAnonDTO,
  type UpdateAskProfileInput,
  maskSpoilers,
} from "@six/shared";
import type { AnonMessage, User } from "../generated/prisma/client.js";
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
  entities: entitiesOf(m),
  photoUrl: m.photoKey ? presignGet(m.photoKey) : null,
  gif: m.gifKey ? { url: presignGet(m.gifKey), width: m.gifWidth, height: m.gifHeight } : null,
  voice: m.voiceKey ? { url: presignGet(m.voiceKey), durationMs: m.voiceMs ?? 0, waveform: m.voiceWaveform } : null,
  createdAt: m.createdAt.toISOString(),
  oldLink: !!renewedAt && m.createdAt < renewedAt,
});

async function askerByCode(code: string) {
  const user = await prisma.user.findFirst({ where: { askCode: code.toUpperCase(), deletedAt: null, bannedAt: null } });
  if (!user) throw new AppError("USER_NOT_FOUND", "This link doesn't work anymore");
  return user;
}

/** How someone looks on their link: the name they picked, else their account name, and only a photo they picked for it. */
const toAskProfile = (u: User): AskProfileDTO => ({
  displayName: u.askName ?? u.displayName,
  avatarUrl: u.askAvatarKey ? presignGet(u.askAvatarKey) : null,
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
  const user = await askerByCode(code);
  return { ...toAskProfile(user), blocked: !!viewerId && (await isAnonBlocked(user.id, viewerId)) };
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
    data: { ...(input.name !== undefined && { askName: input.name || null }), askAvatarKey },
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

/** How many anonymous messages one person can send in an hour: to the same link, and to anyone. */
export const SEND_LIMITS = { perRecipient: 5, total: 30 };

/** How old an account must be to send anonymous messages, so a banned or blocked sender can't just make another. */
export const NEW_ACCOUNT_WAIT_MS = 24 * HOUR;

async function assertOldEnough(senderId: string) {
  const { createdAt } = await prisma.user.findUniqueOrThrow({ where: { id: senderId }, select: { createdAt: true } });
  const from = new Date(createdAt.getTime() + NEW_ACCOUNT_WAIT_MS);
  if (from > new Date()) {
    throw new AppError("ACCOUNT_TOO_NEW", "New accounts wait a day before sending anonymous messages", {
      until: from.toISOString(),
    });
  }
}

/** Turns away a sender who has hit the hourly limits or already sent this text to this person today. */
async function assertNotSpam(senderId: string, recipientId: string, text: string) {
  const since = new Date(Date.now() - HOUR);
  const [toThem, total, repeat] = await Promise.all([
    prisma.anonMessage.count({ where: { senderId, recipientId, createdAt: { gte: since } } }),
    prisma.anonMessage.count({ where: { senderId, createdAt: { gte: since } } }),
    text &&
      prisma.anonMessage.findFirst({
      where: {
        senderId,
        recipientId,
        text: { equals: text, mode: "insensitive" },
        createdAt: { gte: new Date(Date.now() - 24 * HOUR) },
      },
      select: { id: true },
    }),
  ]);
  if (toThem >= SEND_LIMITS.perRecipient || total >= SEND_LIMITS.total) {
    throw new AppError("RATE_LIMITED", "Too many anonymous messages; try again later");
  }
  if (repeat) throw new AppError("CONFLICT", "You already sent this message");
}

/**
 * Re-encodes a voice message to AAC, keeping its first minute and none of its metadata, and stores it under
 * the recipient like a photo.
 */
async function storeVoice(recipientId: string, dataUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), "anon-voice-"));
  try {
    const input = join(dir, "input");
    const out = join(dir, "voice.m4a");
    await writeFile(input, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    await ffmpeg([
      ...["-i", input, "-t", String(ANON_VOICE_MS / 1000), "-vn", "-map_metadata", "-1"],
      ...["-c:a", "aac", "-b:a", "48k", "-ac", "1", "-movflags", "+faststart", out],
    ]);
    const info = await probe(out);
    if (!info.hasAudio || !info.durationMs) throw new Error("no sound");
    const key = `x/${recipientId}/${randomUUID()}.m4a`;
    await putObject(key, await readFile(out), "audio/mp4");
    return { key, durationMs: Math.min(info.durationMs, ANON_VOICE_MS), waveform: await waveform(out) };
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
  const recipient = await askerByCode(code);
  await assertOldEnough(senderId);
  if (await isAnonBlocked(recipient.id, senderId)) throw new AppError("ANON_BLOCKED", "This person isn't taking your messages");
  await assertNotSpam(senderId, recipient.id, text);
  let photoKey: string | null = null;
  if (photo) {
    const p = parsePhoto(photo);
    photoKey = `x/${recipient.id}/${randomUUID()}.${p.ext}`;
    await putObject(photoKey, p.bytes, p.mime);
  }
  const gif = gifId ? await sharedGif(gifId) : null;
  const sound = voice ? await storeVoice(recipient.id, voice) : null;
  const m = await prisma.anonMessage.create({
    data: {
      recipientId: recipient.id,
      senderId,
      text,
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
    where: q.q ? { OR: [{ sender: who }, { recipient: who }] } : {},
    include: { sender: true, recipient: true },
    ...pageArgs(q),
  });
  return toPage(rows, q, (m) => ({
    id: m.id,
    text: m.text,
    photoUrl: m.photoKey ? presignGet(m.photoKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    gifUrl: m.gifKey ? presignGet(m.gifKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    voiceUrl: m.voiceKey ? presignGet(m.voiceKey, undefined, EPHEMERAL_LINK_SECONDS) : null,
    sender: toUserRef(m.sender),
    recipient: toUserRef(m.recipient),
    createdAt: m.createdAt.toISOString(),
    senderDeletedAt: m.senderDeletedAt?.toISOString() ?? null,
    recipientDeletedAt: m.recipientDeletedAt?.toISOString() ?? null,
  }));
}
