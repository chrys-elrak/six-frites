-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "senderDevice" TEXT;

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "senderDevice" TEXT;

UPDATE "ChangeEvent" SET "payload" = jsonb_set("payload", '{encryption,senderDeviceId}', 'null')
WHERE "type" IN ('message.new', 'message.edited') AND jsonb_typeof("payload"->'encryption') = 'object'
  AND NOT "payload"->'encryption' ? 'senderDeviceId';

UPDATE "ChangeEvent" SET "payload" = jsonb_set("payload", '{lastMessage,encryption,senderDeviceId}', 'null')
WHERE "type" = 'chat.updated' AND jsonb_typeof("payload"->'lastMessage'->'encryption') = 'object'
  AND NOT "payload"->'lastMessage'->'encryption' ? 'senderDeviceId';
