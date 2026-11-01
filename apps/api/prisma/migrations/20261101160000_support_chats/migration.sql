ALTER TABLE "Chat" ADD COLUMN "supportUserId" TEXT;

-- Chats with guests are their support chats: mark them, and give them a key of their own so they never merge with a personal chat.
UPDATE "Chat" c
SET "supportUserId" = m."userId", "directKey" = 'support:' || m."userId"
FROM "ChatMember" m
JOIN "User" u ON u.id = m."userId"
WHERE m."chatId" = c.id AND u.guest = true AND c."directKey" IS NOT NULL;
