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

export type TimerJob = { messageId: string } | { uploadIds: string[] };

export const TIMERS_QUEUE = "timers";

let timers: Queue<TimerJob> | null = null;

/** Delayed jobs: destroying self-destructing messages and the files they leave behind. */
export function timersQueue() {
  timers ??= new Queue<TimerJob>(TIMERS_QUEUE, {
    connection: redisConnection(),
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return timers;
}
