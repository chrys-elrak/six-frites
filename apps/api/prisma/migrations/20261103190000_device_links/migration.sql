CREATE TABLE "DeviceLink" (
    "id" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceId" TEXT,
    "userId" TEXT,
    "sealedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceLink_expiresAt_idx" ON "DeviceLink"("expiresAt");

ALTER TABLE "DeviceLink" ADD CONSTRAINT "DeviceLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
