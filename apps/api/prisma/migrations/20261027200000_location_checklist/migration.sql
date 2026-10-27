ALTER TABLE "Message" ADD COLUMN "location" JSONB;
ALTER TABLE "Message" ADD COLUMN "checklist" JSONB;

CREATE TABLE "ChecklistMark" (
    "messageId" TEXT NOT NULL,
    "item" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistMark_pkey" PRIMARY KEY ("messageId","item")
);

CREATE INDEX "ChecklistMark_userId_idx" ON "ChecklistMark"("userId");

ALTER TABLE "ChecklistMark" ADD CONSTRAINT "ChecklistMark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistMark" ADD CONSTRAINT "ChecklistMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
