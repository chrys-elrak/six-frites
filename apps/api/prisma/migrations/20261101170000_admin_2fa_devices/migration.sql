ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpStep" INTEGER;

ALTER TABLE "Session" ADD COLUMN "deviceId" TEXT,
ADD COLUMN "adminVerifiedAt" TIMESTAMP(3);

CREATE INDEX "Session_deviceId_idx" ON "Session"("deviceId");
