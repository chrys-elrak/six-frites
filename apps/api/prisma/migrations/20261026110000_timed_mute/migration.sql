-- AlterTable
ALTER TABLE "ChatMember" ADD COLUMN     "mutedUntil" TIMESTAMP(3);

-- Backfill: stored sync events must match the new ChatDTO shape
UPDATE "ChangeEvent" SET "payload" = "payload" || '{"mutedUntil": null}'
WHERE "payload" ? 'muted' AND NOT "payload" ? 'mutedUntil';
