import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "../generated/prisma/client.js";
import {
  AppError,
  type RemoveContactPinInput,
  type SetContactPinInput,
  type UpdateMeInput,
  type UserDTO,
} from "@six/shared";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { getChat } from "./chats.js";
import { parsePhoto } from "./contacts.js";
import { revokeSession } from "./sessions.js";

/** The photo the user uploaded, else the one their Google account came with. */
export const avatarOf = (u: Pick<User, "avatarUrl" | "avatarKey">) =>
  u.avatarKey ? presignGet(u.avatarKey) : u.avatarUrl;

const RESERVED_USERNAMES = new Set(["admin", "support", "help", "system", "root", "six", "sixfrites", "official"]);

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: avatarOf(u),
    username: u.username,
    contactCode: u.contactCode,
    findByEmail: u.findByEmail,
    backupKeyId: u.backupKeyId,
    hasContactPin: u.contactPinHash !== null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toPublicUser(u: Pick<User, "id" | "displayName" | "avatarUrl" | "avatarKey">) {
  return { id: u.id, displayName: u.displayName, avatarUrl: avatarOf(u) };
}

/** Sends everyone who shares a chat with `userId` that chat again, after their name or photo changed. */
async function announceProfile(tx: Tx, emit: Emit, userId: string) {
  const chats = await tx.chatMember.findMany({ where: { userId }, select: { chatId: true } });
  for (const { chatId } of chats) {
    const others = await tx.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
    for (const o of others) emit(o.userId, "chat.updated", await getChat(o.userId, chatId, tx));
  }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND");
  return toUserDTO(user);
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  if (input.username && RESERVED_USERNAMES.has(input.username)) throw new AppError("USERNAME_TAKEN");
  const { photo, ...data } = input;
  let avatarKey: string | null | undefined = photo === null || data.avatarUrl !== undefined ? null : undefined;
  if (photo) {
    const p = parsePhoto(photo);
    avatarKey = `a/${userId}/${randomUUID()}.${p.ext}`;
    await putObject(avatarKey, p.bytes, p.mime);
  }

  try {
    const { user, previousKey } = await withEvents(async (tx, emit) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
      const user = await tx.user.update({
        where: { id: userId },
        data: { ...data, ...(photo !== undefined && { avatarUrl: null }), ...(avatarKey !== undefined && { avatarKey }) },
      });
      if (data.displayName !== undefined || avatarKey !== undefined) await announceProfile(tx, emit, userId);
      return { user, previousKey: before.avatarKey };
    });
    if (previousKey && previousKey !== user.avatarKey) await deleteObjects([previousKey]).catch(() => null);
    return toUserDTO(user);
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("USERNAME_TAKEN");
    throw err;
  }
}

/** Replaces the user's contact code, so the old code, link and QR stop working. */
export async function resetContactCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { contactCode: generateCode() } }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new AppError("CONFLICT", "Could not generate a unique contact code");
}

/**
 * Deletes the account: signs out every device and strips everything that identifies the person
 * (Google link, email, name, photo, username, contact code, invites, blocks, the names and photos
 * they gave others and others gave them, scheduled messages). What they already sent stays in the
 * other person's history under "Deleted account", and signing in with the same Google account
 * later starts a new, empty account.
 */
export async function deleteAccount(userId: string) {
  const { sessionIds, photoKeys } = await withEvents(async (tx, emit) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new AppError("USER_NOT_FOUND");

    const overrides = await tx.contactOverride.findMany({
      where: { OR: [{ ownerId: userId }, { contactId: userId }] },
      select: { photoKey: true },
    });
    await tx.contactOverride.deleteMany({ where: { OR: [{ ownerId: userId }, { contactId: userId }] } });
    await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.invite.deleteMany({ where: { creatorId: userId } });
    await tx.scheduledMessage.deleteMany({ where: { senderId: userId } });
    await tx.pushToken.deleteMany({ where: { session: { userId } } });
    await tx.messageBackup.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        googleSub: `deleted:${userId}`,
        email: `deleted-${userId}@deleted.invalid`,
        displayName: "Deleted account",
        avatarUrl: null,
        avatarKey: null,
        username: null,
        contactCode: generateCode(),
        findByEmail: false,
        lastSeenAt: null,
        backupKeyId: null,
        deletedAt: new Date(),
      },
    });

    await announceProfile(tx, emit, userId);
    const sessions = await tx.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    return {
      sessionIds: sessions.map((s) => s.id),
      photoKeys: [user.avatarKey, ...overrides.map((o) => o.photoKey)].filter((k): k is string => !!k),
    };
  });

  await Promise.all(sessionIds.map(revokeSession));
  if (photoKeys.length) await deleteObjects(photoKeys).catch(() => null);
}

const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;

async function hashPin(pin: string) {
  const salt = randomBytes(16);
  return `${salt.toString("base64")}:${(await scryptAsync(pin, salt, 32)).toString("base64")}`;
}

async function pinMatches(stored: string, pin: string) {
  const [salt, hash] = stored.split(":") as [string, string];
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(pin, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Checks the code that guards the real names of renamed contacts. Passes when no code is set,
 * unless `required`, since there is then nothing to protect.
 */
export async function checkContactPin(userId: string, pin: string | undefined, required = false) {
  const { contactPinHash } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { contactPinHash: true } });
  if (!contactPinHash) {
    if (required) throw new AppError("CONTACT_PIN_NOT_SET");
    return;
  }
  if (pin === undefined) throw new AppError("CONTACT_PIN_REQUIRED");
  if (!(await pinMatches(contactPinHash, pin))) throw new AppError("WRONG_CONTACT_PIN");
}

export async function setContactPin(userId: string, input: SetContactPinInput) {
  await checkContactPin(userId, input.currentPin);
  const user = await prisma.user.update({ where: { id: userId }, data: { contactPinHash: await hashPin(input.pin) } });
  return toUserDTO(user);
}

export async function removeContactPin(userId: string, input: RemoveContactPinInput) {
  await checkContactPin(userId, input.currentPin, true);
  return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { contactPinHash: null } }));
}
