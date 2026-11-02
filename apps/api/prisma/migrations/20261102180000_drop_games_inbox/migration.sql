-- The games inbox is gone: each member's app drops the chat on its next sync, then the chats, their
-- messages and the account that posted in them are deleted.
DELETE FROM "ChangeEvent" WHERE COALESCE(payload->>'chatId', payload->>'id') IN (SELECT id FROM "Chat" WHERE type = 'games');

INSERT INTO "ChangeEvent" ("userId", type, payload)
SELECT m."userId", 'chat.deleted', jsonb_build_object('chatId', m."chatId", 'scope', 'me')
FROM "ChatMember" m JOIN "Chat" c ON c.id = m."chatId"
WHERE c.type = 'games';

DELETE FROM "Chat" WHERE type = 'games';
DELETE FROM "User" WHERE "googleSub" = 'system:games';
