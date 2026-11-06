import { AppError, type NotificationKind, type NotificationsDTO } from "@six/shared";
import type { Emit, Tx } from "../lib/events.js";
import { prisma } from "../lib/prisma.js";
import { broadcaster, rooms } from "../lib/realtime.js";
import { blockedWith } from "./blocks.js";
import { profilesFor } from "./contacts.js";

interface NewNotification {
  userId: string;
  actorId: string;
  kind: NotificationKind;
  chatId?: string | null;
  emoji?: string;
  video?: boolean;
}

/** Stores a notification and tells the user's open apps once the transaction has committed. */
export async function notify(tx: Tx, emit: Emit, n: NewNotification) {
  if (n.userId === n.actorId) return;
  await tx.notification.create({ data: n });
  emit.after(() => broadcaster().to(rooms.user(n.userId)).emit("notifications:changed"));
}

const LIMIT = 50;

/** The latest notifications, leaving out people since blocked or gone, and how many came since I last looked. */
export async function listNotifications(userId: string): Promise<NotificationsDTO> {
  const [me, rows, blocked] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notificationsSeenAt: true } }),
    prisma.notification.findMany({
      where: { userId, actor: { deletedAt: null } },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    blockedWith(prisma, userId),
  ]);
  const shown = rows.filter((n) => !blocked.has(n.actorId));
  const profile = await profilesFor(prisma, userId, shown.map((n) => n.actorId));
  const seen = me.notificationsSeenAt;
  const items = shown.map((n) => ({
    id: n.id,
    kind: n.kind as NotificationKind,
    user: profile(n.actor),
    chatId: n.chatId,
    emoji: n.emoji,
    video: n.video,
    unread: n.markedUnread || !seen || n.createdAt > seen,
    createdAt: n.createdAt.toISOString(),
  }));
  return { items, unread: shown.filter((n) => !seen || n.createdAt > seen).length };
}

const changed = (userId: string) => broadcaster().to(rooms.user(userId)).emit("notifications:changed");

/** Marks one notification unread again, or read. */
export async function markNotification(userId: string, id: string, unread: boolean) {
  const { count } = await prisma.notification.updateMany({ where: { id, userId }, data: { markedUnread: unread } });
  if (!count) throw new AppError("NOT_FOUND");
  changed(userId);
}

export async function deleteNotification(userId: string, id: string) {
  const { count } = await prisma.notification.deleteMany({ where: { id, userId } });
  if (!count) throw new AppError("NOT_FOUND");
  changed(userId);
}

export async function markNotificationsSeen(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
}

/** Drops notifications older than 30 days. */
export async function deleteOldNotifications() {
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  return count;
}
