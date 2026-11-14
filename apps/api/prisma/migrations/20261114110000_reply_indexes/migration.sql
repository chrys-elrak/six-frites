-- Deleting messages sets the replyToId of their replies to null; without these, each deleted message scans the table.
CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
CREATE INDEX "ScheduledMessage_replyToId_idx" ON "ScheduledMessage"("replyToId");
