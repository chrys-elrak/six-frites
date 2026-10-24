import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";

/** BullMQ needs its own Redis connections; workers block on theirs, so each gets a fresh one. */
export const redisConnection = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export interface MediaJob {
  uploadId: string;
}

export const MEDIA_QUEUE = "media";

let media: Queue<MediaJob> | null = null;

export function mediaQueue() {
  media ??= new Queue<MediaJob>(MEDIA_QUEUE, {
    connection: redisConnection(),
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return media;
}

export type TimerJob =
  | { messageId: string; cycle: number }
  | { purgeMessageId: string; cycle: number }
  | { uploadIds: string[] }
  | { sweep: true };

export const TIMERS_QUEUE = "timers";

/** How often the worker sends due scheduled messages and deletes auto-deleted ones. */
// ponytail: polling sweep, so scheduled messages go out up to 10s late; use per-message delayed jobs if that matters
export const SWEEP_EVERY_MS = 10_000;

let timers: Queue<TimerJob> | null = null;

/** Delayed jobs: destroying self-destructing messages and the files they leave behind, and the sweep. */
export function timersQueue() {
  timers ??= new Queue<TimerJob>(TIMERS_QUEUE, {
    connection: redisConnection(),
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return timers;
}

export interface PushJob {
  messageId: string;
  userId: string;
}

export const PUSH_QUEUE = "push";

let push: Queue<PushJob> | null = null;

export function pushQueue() {
  push ??= new Queue<PushJob>(PUSH_QUEUE, {
    connection: redisConnection(),
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return push;
}
