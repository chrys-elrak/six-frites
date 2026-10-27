CREATE TABLE "ContactLink" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT random_code(),
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactLink_code_key" ON "ContactLink"("code");
CREATE INDEX "ContactLink_userId_createdAt_idx" ON "ContactLink"("userId", "createdAt");

ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
