import { Worker } from "bullmq";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { MEDIA_QUEUE, type MediaJob, mediaQueue, redisConnection } from "./lib/queue.js";
import { ensureBucket } from "./lib/storage.js";
import { processUpload } from "./media/process.js";
import { finishUpload, purgeAbandonedUploads } from "./services/uploads.js";

await ensureBucket();

const worker = new Worker<MediaJob>(
  MEDIA_QUEUE,
  async (job) => {
    if (job.name === "purge-abandoned") return { purged: await purgeAbandonedUploads() };
    await processUpload(job.data.uploadId);
  },
  { connection: redisConnection(), concurrency: 2, prefix: env.QUEUE_PREFIX },
);

worker.on("failed", async (job, err) => {
  console.error(`media job ${job?.name} ${job?.data.uploadId} failed:`, err.message);
  if (job?.name === "process" && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await finishUpload(job.data.uploadId, { status: "failed", error: err.message.slice(0, 500) }).catch(() => null);
  }
});

await mediaQueue().upsertJobScheduler("purge-abandoned", { every: 60 * 60 * 1000 }, { name: "purge-abandoned", data: { uploadId: "" } });
console.log("media worker ready");

const shutdown = async () => {
  await worker.close();
  await mediaQueue().close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
