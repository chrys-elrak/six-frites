-- DropIndex
DROP INDEX "Invite_creatorId_key";

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "message" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invite_creatorId_createdAt_idx" ON "Invite"("creatorId", "createdAt");
