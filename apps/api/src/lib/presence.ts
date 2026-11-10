import { CLIENT_DEVICES, type ClientDevice, type PresenceDTO } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "./prisma.js";
import { redisConnection } from "./queue.js";
import { broadcaster, rooms } from "./realtime.js";
import { blockedWith } from "../services/blocks.js";

const TTL_SECONDS = 75;
const key = (sessionId: string) => `${env.QUEUE_PREFIX}:active:${sessionId}`;
const onlineKey = (userId: string) => `${env.QUEUE_PREFIX}:online:${userId}`;
const deviceKey = (userId: string, device: ClientDevice) => `${env.QUEUE_PREFIX}:online:${userId}:${device}`;
const seenKey = (userId: string) => `${env.QUEUE_PREFIX}:seen:${userId}`;

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());

/**
 * Whether a session has the app open and visible right now. Open apps refresh this every 30s, so a
 * crashed tab drops out after TTL_SECONDS. Used to skip push notifications to devices in use. The
 * value is the session's kind of device, or "1" for a client too old to say.
 */
export async function setActive(sessionId: string, active: boolean, device = "1") {
  if (active) await redis().set(key(sessionId), device, "EX", TTL_SECONDS);
  else await redis().del(key(sessionId));
}

export async function activeSessions(sessionIds: string[]) {
  if (!sessionIds.length) return new Set<string>();
  const values = await redis().mget(sessionIds.map(key));
  return new Set(sessionIds.filter((_, i) => values[i] !== null));
}

/**
 * Everyone who shares a chat with this user, who should hear when they come online or leave. Whoever answers
 * support stays out of sight of the people they help, who only see Six Frites.
 */
async function audience(userId: string) {
  const rows = await prisma.chatMember.findMany({
    where: {
      userId: { not: userId },
      chat: { type: "direct", members: { some: { userId } }, OR: [{ supportUserId: null }, { supportUserId: userId }] },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const blocked = await blockedWith(prisma, userId);
  return rows.map((r) => r.userId).filter((id) => !blocked.has(id));
}

async function announce(userId: string) {
  const [[dto], ids] = await Promise.all([presenceOf([userId]), audience(userId)]);
  if (dto && ids.length) broadcaster().to(ids.map(rooms.user)).emit("presence", dto);
}

/**
 * Tracks a user as online while any of their sessions is active, and on which kinds of device. Every
 * heartbeat refreshes the online key, the device key and the last-seen time in Redis; going offline
 * (the last active session hides the app or disconnects) persists last-seen to the database. Contacts
 * hear whenever that changes. A crash simply lets the keys expire, and readers fall back to the last heartbeat.
 */
export async function setUserPresence(userId: string, sessionId: string, device: ClientDevice | null, active: boolean) {
  await setActive(sessionId, active, device ?? undefined);
  const now = new Date();
  if (active) {
    const [previous, , previousDevice] = await Promise.all([
      redis().set(onlineKey(userId), "1", "EX", TTL_SECONDS, "GET"),
      redis().set(seenKey(userId), now.toISOString(), "EX", 30 * 24 * 60 * 60),
      device ? redis().set(deviceKey(userId, device), "1", "EX", TTL_SECONDS, "GET") : "",
    ]);
    if (previous === null || previousDevice === null) await announce(userId);
    return;
  }

  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: sessionId } },
    select: { id: true },
  });
  const stillActive = sessions.length ? (await redis().mget(sessions.map((s) => key(s.id)))).filter((v) => v !== null) : [];
  const leftDevice = device && !stillActive.includes(device) ? await redis().del(deviceKey(userId, device)) : 0;
  if (stillActive.length) {
    if (leftDevice) await announce(userId);
    return;
  }
  const wasOnline = await redis().del(onlineKey(userId));
  const seen = (await redis().get(seenKey(userId))) ?? now.toISOString();
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date(seen) } });
  if (wasOnline) await announce(userId);
}

export async function presenceOf(userIds: string[]): Promise<PresenceDTO[]> {
  if (!userIds.length) return [];
  const [online, seen, devices, users] = await Promise.all([
    redis().mget(userIds.map(onlineKey)),
    redis().mget(userIds.map(seenKey)),
    redis().mget(userIds.flatMap((id) => CLIENT_DEVICES.map((d) => deviceKey(id, d)))),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, lastSeenAt: true } }),
  ]);
  const stored = new Map(users.map((u) => [u.id, u.lastSeenAt?.toISOString() ?? null]));
  return userIds
    .map((id, i) => ({
      userId: id,
      online: online[i] !== null,
      devices: online[i] === null ? [] : CLIENT_DEVICES.filter((_, d) => devices[i * CLIENT_DEVICES.length + d] !== null),
      lastSeenAt: seen[i] ?? stored.get(id) ?? null,
    }))
    .filter((p) => stored.has(p.userId));
}
