-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "resendCount" INTEGER NOT NULL DEFAULT 0;
