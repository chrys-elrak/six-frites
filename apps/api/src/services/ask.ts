import { randomUUID } from "node:crypto";
import { AppError, type AnonMessageDTO, type AskProfileDTO, type PageQuery, type UpdateAskProfileInput } from "@six/shared";
import type { AnonMessage, User } from "../generated/prisma/client.js";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { pageArgs, toPage } from "../lib/paginate.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { parsePhoto } from "./contacts.js";
import { deliverAnonPush } from "./push.js";
import { toUserDTO } from "./users.js";

const toAnonDTO = (m: AnonMessage): AnonMessageDTO => ({ id: m.id, text: m.text, createdAt: m.createdAt.toISOString() });

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
      return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { askCode: generateCode() } }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique link");
}

const HOUR = 60 * 60 * 1000;

/** How many anonymous messages one person can send in an hour: to the same link, and to anyone. */
export const SEND_LIMITS = { perRecipient: 5, total: 30 };

/**
 * Turns away a sender who has hit the hourly limits or already sent this text to this person today.
 * ponytail: counts the messages still stored, so ones the recipient deleted don't count; keep deleted rows if that's abused.
 */
async function assertNotSpam(senderId: string, recipientId: string, text: string) {
  const since = new Date(Date.now() - HOUR);
  const [toThem, total, repeat] = await Promise.all([
    prisma.anonMessage.count({ where: { senderId, recipientId, createdAt: { gte: since } } }),
    prisma.anonMessage.count({ where: { senderId, createdAt: { gte: since } } }),
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

/** Sends an anonymous message. Someone the recipient blocked is told it went through, so blocking stays quiet. */
export async function sendAnon(senderId: string, code: string, text: string) {
  const recipient = await askerByCode(code);
  const blocked = await prisma.anonBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: recipient.id, blockedId: senderId } },
  });
  if (blocked) return;
  await assertNotSpam(senderId, recipient.id, text);
  const m = await prisma.anonMessage.create({ data: { recipientId: recipient.id, senderId, text } });
  broadcaster().to(rooms.user(recipient.id)).emit("ask:new", toAnonDTO(m));
  void deliverAnonPush(recipient.id, text).catch(() => null);
}

export async function listAnon(userId: string, q: PageQuery) {
  const rows = await prisma.anonMessage.findMany({ where: { recipientId: userId }, ...pageArgs(q) });
  return toPage(rows, q, toAnonDTO);
}

export async function deleteAnon(userId: string, id: string) {
  await prisma.anonMessage.deleteMany({ where: { id, recipientId: userId } });
}

/** Stops whoever sent this message from sending you more, and deletes it, without telling you who it was. */
export async function blockAnonSender(userId: string, id: string) {
  const m = await prisma.anonMessage.findFirst({ where: { id, recipientId: userId } });
  if (!m) throw new AppError("MESSAGE_NOT_FOUND");
  await prisma.$transaction([
    prisma.anonBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: m.senderId } },
      create: { blockerId: userId, blockedId: m.senderId },
      update: {},
    }),
    prisma.anonMessage.delete({ where: { id } }),
  ]);
}
