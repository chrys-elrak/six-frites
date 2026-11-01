ALTER TABLE "Invite" ADD COLUMN "hiddenAt" TIMESTAMP(3);

CREATE TABLE "AskLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AskLink_code_key" ON "AskLink"("code");

CREATE INDEX "AskLink_userId_expiresAt_idx" ON "AskLink"("userId", "expiresAt");

ALTER TABLE "AskLink" ADD CONSTRAINT "AskLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
