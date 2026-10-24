-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "lastDeliveredAt" TIMESTAMP(3),
ADD COLUMN     "lastDeliveredMessageId" TEXT;
