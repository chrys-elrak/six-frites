-- AlterTable
ALTER TABLE "MessageReaction" ADD COLUMN     "gifHeight" INTEGER,
ADD COLUMN     "gifKey" TEXT,
ADD COLUMN     "gifWidth" INTEGER,
ADD COLUMN     "stickerId" TEXT;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

