-- CreateTable
CREATE TABLE "MessageReaction" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId","userId","emoji")
);

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: stored sync events must match the new MessageDTO shape
UPDATE "ChangeEvent" SET "payload" = "payload" || '{"reactions": []}'
WHERE "type" IN ('message.new', 'message.edited') AND NOT "payload" ? 'reactions';

UPDATE "ChangeEvent" SET "payload" = jsonb_set("payload", '{lastMessage,reactions}', '[]')
WHERE "type" = 'chat.updated' AND jsonb_typeof("payload"->'lastMessage') = 'object'
  AND NOT "payload"->'lastMessage' ? 'reactions';
