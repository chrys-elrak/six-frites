DELETE FROM "Message" m
USING "ChatMember" bot
WHERE bot."chatId" = m."chatId" AND bot."userId" = 'frite-bot' AND m."senderId" <> 'frite-bot';
