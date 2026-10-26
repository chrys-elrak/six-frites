-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "encryptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ScheduledMessage" ADD COLUMN     "encrypted" JSONB;

-- AlterTable
ALTER TABLE "Upload" ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "backupKeyId" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "signPub" TEXT NOT NULL,
    "dhPub" TEXT NOT NULL,
    "dhSig" TEXT NOT NULL,
    "signedPreKeyId" INTEGER NOT NULL,
    "signedPreKey" TEXT NOT NULL,
    "signedPreKeySig" TEXT NOT NULL,
    "signedPreKeyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimePreKey" (
    "deviceId" TEXT NOT NULL,
    "keyId" INTEGER NOT NULL,
    "pub" TEXT NOT NULL,

    CONSTRAINT "OneTimePreKey_pkey" PRIMARY KEY ("deviceId","keyId")
);

-- CreateTable
CREATE TABLE "MessageEnvelope" (
    "messageId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,

    CONSTRAINT "MessageEnvelope_pkey" PRIMARY KEY ("messageId","deviceId")
);

-- CreateTable
CREATE TABLE "MessageBackup" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBackup_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_sessionId_key" ON "Device"("sessionId");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "MessageEnvelope_deviceId_idx" ON "MessageEnvelope"("deviceId");

-- CreateIndex
CREATE INDEX "MessageBackup_userId_idx" ON "MessageBackup"("userId");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimePreKey" ADD CONSTRAINT "OneTimePreKey_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEnvelope" ADD CONSTRAINT "MessageEnvelope_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageEnvelope" ADD CONSTRAINT "MessageEnvelope_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBackup" ADD CONSTRAINT "MessageBackup_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBackup" ADD CONSTRAINT "MessageBackup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stored events carry the new fields, so syncing clients can parse them.
CREATE FUNCTION pg_temp.with_e2ee_fields(m jsonb) RETURNS jsonb AS $$
  SELECT m
    || '{"encryption": null}'
    || CASE WHEN jsonb_typeof(m->'replyTo') = 'object'
         THEN jsonb_build_object('replyTo', (m->'replyTo') || '{"encrypted": false}') ELSE '{}' END
    || CASE WHEN jsonb_typeof(m->'attachment') = 'object'
         THEN jsonb_build_object('attachment', (m->'attachment') || '{"encrypted": false}') ELSE '{}' END
$$ LANGUAGE sql IMMUTABLE;

UPDATE "ChangeEvent" SET "payload" = pg_temp.with_e2ee_fields("payload")
WHERE "type" IN ('message.new', 'message.edited') AND NOT "payload" ? 'encryption';

UPDATE "ChangeEvent" SET "payload" = "payload" || '{"encrypted": false}'
WHERE "type" = 'chat.updated' AND NOT "payload" ? 'encrypted';

UPDATE "ChangeEvent" SET "payload" = jsonb_set("payload", '{lastMessage}', pg_temp.with_e2ee_fields("payload"->'lastMessage'))
WHERE "type" = 'chat.updated' AND jsonb_typeof("payload"->'lastMessage') = 'object'
  AND NOT "payload"->'lastMessage' ? 'encryption';
