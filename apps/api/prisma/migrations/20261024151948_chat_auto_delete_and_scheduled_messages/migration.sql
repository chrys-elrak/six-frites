/*
  Warnings:

  - You are about to drop the column `autoDeleteSecs` on the `ChatMember` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "autoDeleteSecs" INTEGER;

-- AlterTable
ALTER TABLE "ChatMember" DROP COLUMN "autoDeleteSecs";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "action" JSONB,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT,
    "entities" JSONB,
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "maxViews" INTEGER,
    "ttlSeconds" INTEGER,
    "attachmentId" TEXT,
    "replyToId" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMessage_attachmentId_key" ON "ScheduledMessage"("attachmentId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_chatId_senderId_idx" ON "ScheduledMessage"("chatId", "senderId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_sendAt_idx" ON "ScheduledMessage"("sendAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledMessage_senderId_clientId_key" ON "ScheduledMessage"("senderId", "clientId");

-- CreateIndex
CREATE INDEX "Message_expiresAt_idx" ON "Message"("expiresAt");

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
