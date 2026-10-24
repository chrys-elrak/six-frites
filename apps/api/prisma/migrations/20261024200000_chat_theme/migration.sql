-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "theme" TEXT;

-- Stored chat.updated events are replayed by /v1/sync through ChatDTO, which now requires theme.
UPDATE "ChangeEvent" SET "payload" = "payload" || '{"theme": null}'
WHERE "type" = 'chat.updated' AND NOT "payload" ? 'theme';
