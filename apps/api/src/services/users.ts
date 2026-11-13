import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { User } from "../generated/prisma/client.js";
import {
  AppError,
  type AppLockInput,
  type UpdateMeInput,
  type UserDTO,
  facebookOnly,
  isLocale,
} from "@six/shared";
import { env } from "../env.js";
import { generateCode, isUniqueViolation } from "../lib/codes.js";
import { type Emit, type Tx, withEvents } from "../lib/events.js";
import { presenceOf } from "../lib/presence.js";
import { prisma } from "../lib/prisma.js";
import { deleteObjects, presignGet, putObject } from "../lib/storage.js";
import { checkBackupPin } from "./backups.js";
import { getChat } from "./chats.js";
import { parsePhoto } from "./contacts.js";
import { chatBanned, revokeSession } from "./sessions.js";

/** The photo the user uploaded, else the one their Google account came with. */
export const avatarOf = (u: Pick<User, "avatarUrl" | "avatarKey">) =>
  u.avatarKey ? presignGet(u.avatarKey) : u.avatarUrl;

export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: avatarOf(u),
    contactCode: u.contactCode,
    askCode: u.askCode,
    backupKeyId: u.backupKeyId,
    hasBackupPin: u.backupPinHash !== null,
    hasAppLock: u.appLockHash !== null,
    appLockIsPin: u.appLockHash !== null && u.appLockHash === u.backupPinHash,
    appLockLength: u.appLockHash ? u.appLockLength : null,
    ads: !u.adsDisabled,
    anonBot: !u.anonBotDisabled,
    quickReactions: u.quickReactions,
    guest: u.guest,
    support: env.ADMIN_EMAILS.includes(u.email.toLowerCase()) && !facebookOnly(u.providers),
    chatBan: chatBanned(u) ? { until: u.bannedUntil?.toISOString() ?? null } : null,
    termsAccepted: u.termsAcceptedAt !== null,
    tourSeen: u.tourSeenAt !== null,
    locale: isLocale(u.locale) ? u.locale : null,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * The alias `viewerId` sees for `userId`. Each pair gets its own, so two people can't tell they know the same
 * person by comparing names. Matches the pair_alias SQL function, which the contact list sorts and searches by.
 */
export function pairAlias(viewerId: string, userId: string) {
  return `#${createHash("md5").update(`${viewerId}:${userId}`).digest("hex").slice(0, 6).toUpperCase()}`;
}

/** Whoever asked support for help, as the desk sees them: their real name and photo. */
export const supportCase = (u: Parameters<typeof toPublicUser>[0]) => toPublicUser(u, u.id, true);

/** Someone as `viewerId` sees them: their alias for that viewer and no photo, unless they share their profile. */
export function toPublicUser(
  u: Pick<User, "id" | "displayName" | "avatarUrl" | "avatarKey" | "deletedAt">,
  viewerId: string,
  shared: boolean,
) {
  if (shared) return { id: u.id, displayName: u.displayName, avatarUrl: avatarOf(u) };
  return { id: u.id, displayName: u.deletedAt ? u.displayName : pairAlias(viewerId, u.id), avatarUrl: null };
}

/** Sends everyone who shares a chat with `userId` that chat again, after their name or photo changed. */
async function announceProfile(tx: Tx, emit: Emit, userId: string) {
  const chats = await tx.chatMember.findMany({ where: { userId }, select: { chatId: true } });
  for (const { chatId } of chats) {
    const others = await tx.chatMember.findMany({ where: { chatId, userId: { not: userId } }, select: { userId: true } });
    for (const o of others) emit(o.userId, "chat.updated", await getChat(o.userId, chatId, tx));
  }
}

export async function acceptTerms(userId: string) {
  return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { termsAcceptedAt: new Date() } }));
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND");
  return toUserDTO(user);
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  const { photo, tourSeen, ...data } = input;
  let avatarKey: string | null | undefined = photo === null || data.avatarUrl !== undefined ? null : undefined;
  if (photo) {
    const p = parsePhoto(photo);
    avatarKey = `a/${userId}/${randomUUID()}.${p.ext}`;
    await putObject(avatarKey, p.bytes, p.mime);
  }

  const { user, previousKey } = await withEvents(async (tx, emit) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...data,
        ...(photo !== undefined && { avatarUrl: null }),
        ...(avatarKey !== undefined && { avatarKey }),
        ...(tourSeen && { tourSeenAt: new Date() }),
      },
    });
    if (data.displayName !== undefined || avatarKey !== undefined) await announceProfile(tx, emit, userId);
    emit(userId, "me.updated", toUserDTO(user));
    return { user, previousKey: before.avatarKey };
  });
  if (previousKey && previousKey !== user.avatarKey) await deleteObjects([previousKey]).catch(() => null);
  return toUserDTO(user);
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
 * (Google link, email, name, photo, contact code and links, invites, blocks, the names and photos
 * they gave others and others gave them, scheduled messages). What they already sent stays in the
 * other person's history under "Deleted account", and signing in with the same Google account
 * later starts a new, empty account.
 */
export async function deleteAccount(userId: string) {
  const { sessionIds, photoKeys, attachments } = await withEvents(async (tx, emit) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new AppError("USER_NOT_FOUND");

    const overrides = await tx.contactOverride.findMany({
      where: { OR: [{ ownerId: userId }, { contactId: userId }] },
      select: { photoKey: true },
    });
    await tx.contactOverride.deleteMany({ where: { OR: [{ ownerId: userId }, { contactId: userId }] } });
    await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.invite.deleteMany({ where: { creatorId: userId } });
    await tx.contactLink.deleteMany({ where: { userId } });
    const { leaveAllGroups } = await import("./groups.js");
    const groups = await leaveAllGroups(tx, emit, userId);
    await tx.scheduledMessage.deleteMany({ where: { senderId: userId } });
    await tx.note.deleteMany({ where: { userId } });
    await tx.pushToken.deleteMany({ where: { session: { userId } } });
    await tx.messageBackup.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        googleSub: `deleted:${userId}`,
        firebaseUid: null,
        email: `deleted-${userId}@deleted.invalid`,
        displayName: "Deleted account",
        avatarUrl: null,
        avatarKey: null,
        contactCode: generateCode(),
        askCode: generateCode(),
        askName: null,
        askAvatarKey: null,
        lastSeenAt: null,
        backupKeyId: null,
        backupPinHash: null,
        backupWrapped: null,
        deletedAt: new Date(),
      },
    });

    await announceProfile(tx, emit, userId);
    const sessions = await tx.session.findMany({ where: { userId, revokedAt: null }, select: { id: true } });
    return {
      sessionIds: sessions.map((s) => s.id),
      photoKeys: [user.avatarKey, user.askAvatarKey, ...overrides.map((o) => o.photoKey), ...groups.photos].filter(
        (k): k is string => !!k,
      ),
      attachments: groups.attachments,
    };
  });

  await Promise.all(sessionIds.map(revokeSession));
  if (photoKeys.length) await deleteObjects(photoKeys).catch(() => null);
  if (attachments.length) await (await import("./uploads.js")).purgeUploads(attachments);
}

const HIDDEN_APPLE_EMAIL = "@privaterelay.appleid.com";
const HIDDEN_APPLE_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Deletes accounts made with Apple behind a hidden email once nobody has used them for a week. */
export async function deleteIdleHiddenAppleAccounts() {
  const cutoff = new Date(Date.now() - HIDDEN_APPLE_IDLE_MS);
  const idle = await prisma.user.findMany({
    where: {
      deletedAt: null,
      email: { endsWith: HIDDEN_APPLE_EMAIL },
      OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, createdAt: { lt: cutoff } }],
    },
    select: { id: true },
    take: 50,
  });
  const online = new Set((await presenceOf(idle.map((u) => u.id))).filter((p) => p.online).map((p) => p.userId));
  let deleted = 0;
  for (const { id } of idle) {
    if (online.has(id)) continue;
    await deleteAccount(id).then(
      () => deleted++,
      (err) => console.error(`could not delete idle Apple account ${id}:`, err.message),
    );
  }
  return deleted;
}

const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  return `${salt.toString("base64")}:${(await scryptAsync(pin, salt, 32)).toString("base64")}`;
}

export async function pinMatches(stored: string, pin: string) {
  const [salt, hash] = stored.split(":") as [string, string];
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(pin, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Turns the app lock on. With a backup PIN, `code` has to be that PIN, a counted try, and becomes the lock code too;
 * without one it's a code of its own. Turning it off needs no code: only an unlocked app gets there.
 */
export async function setAppLock(userId: string, input: AppLockInput) {
  const { backupPinHash } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { backupPinHash: true } });
  const appLockHash = backupPinHash ? (await checkBackupPin(userId, input.code)).backupPinHash! : await hashPin(input.code);
  return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { appLockHash, appLockLength: input.code.length } }));
}

export async function removeAppLock(userId: string) {
  return toUserDTO(await prisma.user.update({ where: { id: userId }, data: { appLockHash: null } }));
}

/**
 * Checks `code` against the app lock. When it's the backup PIN, the try counts against the PIN's, so the lock can't
 * be used to guess it.
 */
async function checkAppLock(userId: string, code: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { appLockHash: true, backupPinHash: true, appLockLength: true },
  });
  if (!u.appLockHash) return false;
  if (u.appLockHash === u.backupPinHash) await checkBackupPin(userId, code);
  else if (!(await pinMatches(u.appLockHash, code))) throw new AppError("WRONG_APP_LOCK_CODE");
  if (u.appLockLength !== code.length) await prisma.user.update({ where: { id: userId }, data: { appLockLength: code.length } });
  return true;
}

/** Checks `code` against the app lock, which has to be on. */
export async function requireAppLock(userId: string, code: string) {
  if (!(await checkAppLock(userId, code))) throw new AppError("APP_LOCK_REQUIRED");
}

export async function unlockApp(userId: string, input: AppLockInput) {
  await checkAppLock(userId, input.code);
}
