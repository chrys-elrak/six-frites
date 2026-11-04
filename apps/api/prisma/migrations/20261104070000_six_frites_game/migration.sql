UPDATE "ChatMember" SET "showProfile" = true WHERE "userId" = 'frite-bot';
UPDATE "User" SET "displayName" = 'Six Frites Game' WHERE "id" = 'frite-bot';
UPDATE "Message" SET "text" = replace("text", 'Frite Bot', 'Six Frites Game') WHERE "senderId" = 'frite-bot' AND "clientId" LIKE 'hello:%';
