ALTER TABLE "Message" ADD COLUMN "resealRequestedAt" TIMESTAMP(3),
ADD COLUMN "resealRequestedBy" TEXT,
ADD COLUMN "resealFailedAt" TIMESTAMP(3);
