import { AppError, type StoreBackupsInput } from "@six/shared";
import { prisma } from "../lib/prisma.js";
import { toUserDTO } from "./users.js";
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
    return toUserDTO(await tx.user.update({ where: { id: userId }, data: { backupKeyId } }));
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
