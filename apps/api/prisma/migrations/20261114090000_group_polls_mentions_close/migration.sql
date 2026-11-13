ALTER TABLE "Chat" ADD COLUMN "closedUntil" TIMESTAMP(3);

ALTER TABLE "Message" ADD COLUMN "poll" JSONB,
ADD COLUMN "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "PollVote" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "option" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("messageId","userId")
);

CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
