-- The Six Frites bot writes to anonymous inboxes now and then: its messages have no sender, and each
-- user keeps their own random time for the next one.
ALTER TABLE "User" ADD COLUMN "anonBotDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "anonBotAt" TIMESTAMP(3);

CREATE INDEX "User_anonBotAt_idx" ON "User"("anonBotAt");

ALTER TABLE "AnonMessage" ALTER COLUMN "senderId" DROP NOT NULL,
ADD COLUMN "botLine" INTEGER;
