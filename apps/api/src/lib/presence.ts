import type { PresenceDTO } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { prisma } from "./prisma.js";
import { redisConnection } from "./queue.js";
import { broadcaster, rooms } from "./realtime.js";

const TTL_SECONDS = 75;
const key = (sessionId: string) => `${env.QUEUE_PREFIX}:active:${sessionId}`;
const onlineKey = (userId: string) => `${env.QUEUE_PREFIX}:online:${userId}`;
const seenKey = (userId: string) => `${env.QUEUE_PREFIX}:seen:${userId}`;

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());

/**
 * Whether a session has the app open and visible right now. Open apps refresh this every 30s, so a
 * crashed tab drops out after TTL_SECONDS. Used to skip push notifications to devices in use.
 */
export async function setActive(sessionId: string, active: boolean) {
  if (active) await redis().set(key(sessionId), "1", "EX", TTL_SECONDS);
  else await redis().del(key(sessionId));
}

export async function activeSessions(sessionIds: string[]) {
  if (!sessionIds.length) return new Set<string>();
  const values = await redis().mget(sessionIds.map(key));
  return new Set(sessionIds.filter((_, i) => values[i] !== null));
}

/** Everyone who shares a chat with this user, who should hear when they come online or leave. */
async function audience(userId: string) {
  const rows = await prisma.chatMember.findMany({
    where: { userId: { not: userId }, chat: { members: { some: { userId } } } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}

async function announce(dto: PresenceDTO) {
  const ids = await audience(dto.userId);
  if (ids.length) broadcaster().to(ids.map(rooms.user)).emit("presence", dto);
}

/**
 * Tracks a user as online while any of their sessions is active. Every heartbeat refreshes the
 * online key and the last-seen time in Redis; going offline (the last active session hides the app
 * or disconnects) persists last-seen to the database and tells their contacts. A crash simply lets
 * the online key expire, and readers fall back to the last heartbeat.
 */
export async function setUserPresence(userId: string, sessionId: string, active: boolean) {
  await setActive(sessionId, active);
  const now = new Date();
  if (active) {
    const [previous] = await Promise.all([
      redis().set(onlineKey(userId), "1", "EX", TTL_SECONDS, "GET"),
      redis().set(seenKey(userId), now.toISOString(), "EX", 30 * 24 * 60 * 60),
    ]);
    if (previous === null) await announce({ userId, online: true, lastSeenAt: now.toISOString() });
    return;
  }

  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, id: { not: sessionId } },
    select: { id: true },
  });
  if ((await activeSessions(sessions.map((s) => s.id))).size) return;
  const wasOnline = await redis().del(onlineKey(userId));
  const seen = (await redis().get(seenKey(userId))) ?? now.toISOString();
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date(seen) } });
  if (wasOnline) await announce({ userId, online: false, lastSeenAt: seen });
}

export async function presenceOf(userIds: string[]): Promise<PresenceDTO[]> {
  if (!userIds.length) return [];
  const [online, seen, users] = await Promise.all([
    redis().mget(userIds.map(onlineKey)),
    redis().mget(userIds.map(seenKey)),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, lastSeenAt: true } }),
  ]);
  const stored = new Map(users.map((u) => [u.id, u.lastSeenAt?.toISOString() ?? null]));
  return userIds
    .map((id, i) => ({ userId: id, online: online[i] !== null, lastSeenAt: seen[i] ?? stored.get(id) ?? null }))
    .filter((p) => stored.has(p.userId));
}
