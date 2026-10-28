ALTER TABLE "ScheduledMessage" ADD COLUMN "stickerId" TEXT,
ADD COLUMN "groupId" TEXT,
ADD COLUMN "type" TEXT,
ADD COLUMN "location" JSONB,
ADD COLUMN "checklist" JSONB;
