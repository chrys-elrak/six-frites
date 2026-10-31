ALTER TABLE "User" ADD COLUMN "askCode" TEXT NOT NULL DEFAULT random_code();
CREATE UNIQUE INDEX "User_askCode_key" ON "User"("askCode");

CREATE TABLE "AnonMessage" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnonMessage_recipientId_createdAt_idx" ON "AnonMessage"("recipientId", "createdAt");

ALTER TABLE "AnonMessage" ADD CONSTRAINT "AnonMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnonMessage" ADD CONSTRAINT "AnonMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AnonBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

ALTER TABLE "AnonBlock" ADD CONSTRAINT "AnonBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnonBlock" ADD CONSTRAINT "AnonBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
