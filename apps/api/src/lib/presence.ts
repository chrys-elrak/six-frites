import type { Redis } from "ioredis";
import { env } from "../env.js";
import { redisConnection } from "./queue.js";

const TTL_SECONDS = 75;
const key = (sessionId: string) => `${env.QUEUE_PREFIX}:active:${sessionId}`;

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
