import { createHmac } from "node:crypto";
import { AppError, type SetBackupPinInput, type StoreBackupsInput } from "@six/shared";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { hashPin, pinMatches, toUserDTO } from "./users.js";
import { visibleTo } from "./messages.js";

/**
 * Records which key the user's backups are sealed with, so a new device can tell whether the
 * recovery key typed in is the right one. Changing it drops the backups sealed with the old key,
 * which the new one could not open anyway.
 */
export async function setBackupKey(userId: string, backupKeyId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.backupKeyId === backupKeyId) return toUserDTO(user);
    if (user.backupKeyId) await tx.messageBackup.deleteMany({ where: { userId } });
    return toUserDTO(
      await tx.user.update({
        where: { id: userId },
        data: { backupKeyId, backupPinHash: null, backupWrapped: null, backupPinTries: 0 },
      }),
    );
  });
}

/** Stores the user's own sealed copies of encrypted messages they can see, replacing older ones. */
export async function storeBackups(userId: string, { items }: StoreBackupsInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { backupKeyId: true } });
  if (!user.backupKeyId) throw new AppError("BACKUP_KEY_MISMATCH", "Set up a recovery key first");

  const ids = [...new Set(items.map((i) => i.messageId))];
  const members = await prisma.chatMember.findMany({ where: { userId } });
  const messages = await prisma.message.findMany({
    where: { id: { in: ids }, encrypted: true, deletedAt: null, purgedAt: null, chatId: { in: members.map((m) => m.chatId) } },
    select: { id: true, chatId: true },
  });
  const cleared = new Map(members.map((m) => [m.chatId, m.clearedAt]));
  const visible = await prisma.message.findMany({
    where: {
      OR: messages.map((m) => ({ id: m.id, ...visibleTo(userId, cleared.get(m.chatId) ?? null) })),
    },
    select: { id: true },
  });
  if (visible.length !== ids.length) throw new AppError("MESSAGE_NOT_FOUND");

  await prisma.$transaction(
    items.map((i) =>
      prisma.messageBackup.upsert({
        where: { messageId_userId: { messageId: i.messageId, userId } },
        create: { messageId: i.messageId, userId, sealed: i.sealed },
        update: { sealed: i.sealed, createdAt: new Date() },
      }),
    ),
  );
}

const PIN_TRIES = 10;

/** Mixed into the user's PIN-sealed backup key. Derived from a server secret, so the database alone can't open it. */
export const backupSecret = (userId: string) =>
  createHmac("sha256", env.BACKUP_PIN_SECRET).update(userId).digest("base64url");

/** Stores the backup key sealed with a new PIN. A different key starts a new backup and drops the old one. */
export async function setBackupPin(userId: string, input: SetBackupPinInput) {
  const backupPinHash = await hashPin(input.pin);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.backupKeyId && user.backupKeyId !== input.backupKeyId) {
      await tx.messageBackup.deleteMany({ where: { userId } });
    }
    const data = { backupKeyId: input.backupKeyId, backupPinHash, backupWrapped: input.wrapped, backupPinTries: 0 };
    return toUserDTO(await tx.user.update({ where: { id: userId }, data }));
  });
}

/**
 * Hands back the PIN-sealed backup key when the PIN matches. Each try is counted before the PIN is
 * checked, so parallel guesses count too, and after PIN_TRIES wrong ones the whole backup is deleted.
 */
export async function unlockBackup(userId: string, pin: string) {
  const reserved = await prisma.user.updateMany({
    where: { id: userId, backupPinHash: { not: null }, backupPinTries: { lt: PIN_TRIES } },
    data: { backupPinTries: { increment: 1 } },
  });
  if (!reserved.count) throw new AppError("BACKUP_PIN_NOT_SET");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.backupPinHash && user.backupWrapped && (await pinMatches(user.backupPinHash, pin))) {
    await prisma.user.update({ where: { id: userId }, data: { backupPinTries: 0 } });
    return { wrapped: user.backupWrapped, secret: backupSecret(userId) };
  }
  const triesLeft = Math.max(0, PIN_TRIES - user.backupPinTries);
  if (!triesLeft) {
    await prisma.$transaction([
      prisma.messageBackup.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { backupKeyId: null, backupPinHash: null, backupWrapped: null, backupPinTries: 0 },
      }),
    ]);
  }
  throw new AppError("WRONG_BACKUP_PIN", "That's not your backup PIN", { triesLeft });
}
