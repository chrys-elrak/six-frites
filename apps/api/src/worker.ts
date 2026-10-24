import { Worker } from "bullmq";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import {
  MEDIA_QUEUE,
  type MediaJob,
  PUSH_QUEUE,
  type PushJob,
  TIMERS_QUEUE,
  type TimerJob,
  mediaQueue,
  redisConnection,
  pushQueue,
  timersQueue,
} from "./lib/queue.js";
import { ensureBucket } from "./lib/storage.js";
import { processUpload } from "./media/process.js";
import { expireMessage, purgeMessage } from "./services/messages.js";
import { deliverPush } from "./services/push.js";
import { finishUpload, purgeAbandonedUploads, purgeUploads } from "./services/uploads.js";

await ensureBucket();

const worker = new Worker<MediaJob>(
  MEDIA_QUEUE,
  async (job) => {
    if (job.name === "purge-abandoned") return { purged: await purgeAbandonedUploads() };
    await processUpload(job.data.uploadId);
  },
  { connection: redisConnection(), concurrency: 2, prefix: env.QUEUE_PREFIX },
);

const timers = new Worker<TimerJob>(
  TIMERS_QUEUE,
  async (job) => {
    if ("messageId" in job.data) await expireMessage(job.data.messageId, job.data.cycle);
    else if ("purgeMessageId" in job.data) await purgeMessage(job.data.purgeMessageId, job.data.cycle);
    else await purgeUploads(job.data.uploadIds);
  },
  { connection: redisConnection(), concurrency: 4, prefix: env.QUEUE_PREFIX },
);
const pushes = new Worker<PushJob>(
  PUSH_QUEUE,
  async (job) => ({ sent: await deliverPush(job.data.messageId, job.data.userId) }),
  {
    connection: redisConnection(),
    concurrency: 8,
    prefix: env.QUEUE_PREFIX,
  },
);
pushes.on("failed", (job, err) => console.error(`push for ${job?.data.messageId} failed:`, err.message));

timers.on("failed", (job, err) => console.error(`timer job ${job?.name} failed:`, err.message));

worker.on("failed", async (job, err) => {
  console.error(`media job ${job?.name} ${job?.data.uploadId} failed:`, err.message);
  if (job?.name === "process" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await finishUpload(job.data.uploadId, { status: "failed", error: err.message.slice(0, 500) }).catch(() => null);
  }
});

await mediaQueue().upsertJobScheduler(
  "purge-abandoned",
  { every: 60 * 60 * 1000 },
  { name: "purge-abandoned", data: { uploadId: "" } },
);
console.log("media worker ready");

const shutdown = async () => {
  await Promise.all([worker.close(), timers.close(), pushes.close()]);
  await Promise.all([mediaQueue().close(), timersQueue().close(), pushQueue().close()]);
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
