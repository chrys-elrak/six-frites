ALTER TABLE "Message" ADD COLUMN "game" JSONB;

CREATE TABLE "GameMove" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "move" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameMove_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GameMove_messageId_createdAt_idx" ON "GameMove"("messageId", "createdAt");

CREATE INDEX "GameMove_userId_idx" ON "GameMove"("userId");

ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GameMove" ADD CONSTRAINT "GameMove_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
