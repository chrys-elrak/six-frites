import { randomUUID } from "node:crypto";
import {
  type AdminAnonQuery,
  AppError,
  type AnonMessageDTO,
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
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { parsePhoto } from "./contacts.js";
import { EPHEMERAL_LINK_SECONDS, entitiesOf, storedEntities } from "./messages.js";
import { deliverAnonPush } from "./push.js";
import { toUserRef } from "./reports.js";
import { toUserDTO } from "./users.js";

const toAnonDTO = (m: AnonMessage, renewedAt?: Date | null): AnonMessageDTO => ({
  id: m.id,
  text: m.text,
  entities: entitiesOf(m),
  photoUrl: m.photoKey ? presignGet(m.photoKey) : null,
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

export async function askProfile(code: string) {
  return toAskProfile(await askerByCode(code));
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
 * Sends an anonymous message. A message from someone the recipient blocked is kept, hidden from the recipient,
 * so it still shows in the sender's sent list and blocking stays quiet. A photo is stored under the recipient,
 * so its address says nothing about who sent it.
 */
export async function sendAnon(senderId: string, code: string, { text, entities, photo }: SendAnonInput) {
  const recipient = await askerByCode(code);
  await assertNotSpam(senderId, recipient.id, text);
  const blocked = await prisma.anonBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: recipient.id, blockedId: senderId } },
  });
  let photoKey: string | null = null;
  if (photo) {
    const p = parsePhoto(photo);
    photoKey = `x/${recipient.id}/${randomUUID()}.${p.ext}`;
    await putObject(photoKey, p.bytes, p.mime);
  }
  const m = await prisma.anonMessage.create({
    data: {
      recipientId: recipient.id,
      senderId,
      text,
      entities: storedEntities(entities),
      photoKey,
      recipientDeletedAt: blocked ? new Date() : null,
    },
  });
  if (blocked) return;
  broadcaster().to(rooms.user(recipient.id)).emit("ask:new", toAnonDTO(m));
  void deliverAnonPush(recipient.id, maskSpoilers(text, entities)).catch(() => null);
}

export async function listAnon(userId: string, q: PageQuery) {
  const [rows, { askRenewedAt }] = await Promise.all([
    prisma.anonMessage.findMany({ where: { recipientId: userId, recipientDeletedAt: null }, ...pageArgs(q) }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { askRenewedAt: true } }),
  ]);
  return toPage(rows, q, (m) => toAnonDTO(m, askRenewedAt));
}

/** What you sent, newest first, with whom you sent it to. Nothing says whether they deleted it or blocked you. */
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

/** Hides whatever this message's sender sends you from now on, and this message, without telling you who it was. */
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
    sender: toUserRef(m.sender),
    recipient: toUserRef(m.recipient),
    createdAt: m.createdAt.toISOString(),
    senderDeletedAt: m.senderDeletedAt?.toISOString() ?? null,
    recipientDeletedAt: m.recipientDeletedAt?.toISOString() ?? null,
  }));
}
