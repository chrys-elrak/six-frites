ALTER TABLE "Chat" ADD COLUMN "title" TEXT,
ADD COLUMN "photoKey" TEXT,
ADD COLUMN "inviteCode" TEXT,
ADD COLUMN "maxMembers" INTEGER;

CREATE UNIQUE INDEX "Chat_inviteCode_key" ON "Chat"("inviteCode");

ALTER TABLE "ChatMember" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN "nickname" TEXT,
ADD COLUMN "photoKey" TEXT;

CREATE TABLE "ChatBan" (
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatBan_pkey" PRIMARY KEY ("chatId","userId")
);

CREATE INDEX "ChatBan_userId_idx" ON "ChatBan"("userId");

ALTER TABLE "ChatBan" ADD CONSTRAINT "ChatBan_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatBan" ADD CONSTRAINT "ChatBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
