import type { UserUsageDTO } from "@six/shared";
import type { Redis } from "ioredis";
import { env } from "../env.js";
import { redisConnection } from "../lib/queue.js";

const KEEP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

let client: Redis | null = null;
const redis = () => (client ??= redisConnection());
const dayOf = (at: Date) => at.toISOString().slice(0, 10);
const key = (userId: string, day: string) => `${env.QUEUE_PREFIX}:usage:${userId}:${day}`;

/** Counts one call someone made to the API, over REST or the socket, under its route or event name. */
export function countCall(userId: string, name: string) {
  const k = key(userId, dayOf(new Date()));
  void redis()
    .multi()
    .hincrby(k, "calls", 1)
    .hincrby(k, `call:${name}`, 1)
    .expire(k, KEEP_DAYS * 86_400)
    .exec()
    .catch(() => null);
}

/** Adds time someone spent with the app open and visible on `page`, to the day and UTC hour it ended in. */
export function addTime(userId: string, page: string, seconds: number, at = new Date()) {
  if (seconds < 1) return;
  const k = key(userId, dayOf(at));
  void redis()
    .multi()
    .hincrby(k, "time", seconds)
    .hincrby(k, `page:${page}`, seconds)
    .hincrby(k, `hour:${at.getUTCHours()}`, seconds)
    .expire(k, KEEP_DAYS * 86_400)
    .exec()
    .catch(() => null);
}

const ranked = (totals: Map<string, number>) =>
  [...totals].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

/** Someone's time in the app and calls to the API over the last `days` days (UTC), today included. */
export async function usageOf(userId: string, days: number): Promise<UserUsageDTO> {
  const dates = Array.from({ length: days }, (_, i) => dayOf(new Date(Date.now() - (days - 1 - i) * DAY_MS)));
  const pipe = redis().pipeline();
  for (const d of dates) pipe.hgetall(key(userId, d));
  const rows = ((await pipe.exec()) ?? []).map(([, v]) => (v ?? {}) as Record<string, string>);
  const pages = new Map<string, number>();
  const calls = new Map<string, number>();
  const hours = Array<number>(24).fill(0);
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      const n = Number(value);
      if (field.startsWith("page:")) pages.set(field.slice(5), (pages.get(field.slice(5)) ?? 0) + n);
      else if (field.startsWith("call:")) calls.set(field.slice(5), (calls.get(field.slice(5)) ?? 0) + n);
      else if (field.startsWith("hour:")) hours[Number(field.slice(5))]! += n;
    }
  }
  return {
    days: dates.map((day, i) => ({ day, seconds: Number(rows[i]!.time ?? 0), calls: Number(rows[i]!.calls ?? 0) })),
    hours,
    pages: ranked(pages).map(({ name, value }) => ({ page: name, seconds: value })),
    calls: ranked(calls).slice(0, 40).map(({ name, value }) => ({ name, count: value })),
  };
}
