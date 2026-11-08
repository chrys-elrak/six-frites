ALTER TABLE "Message" ADD COLUMN "threadId" TEXT;
ALTER TABLE "Message" ADD COLUMN "threadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "threadClosed" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");
