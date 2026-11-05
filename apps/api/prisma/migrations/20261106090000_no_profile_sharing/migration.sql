-- Sharing your real name and photo with a contact is gone; only Frite Bot still shows its own.
UPDATE "ChatMember" SET "showProfile" = false WHERE "showProfile" AND "userId" <> 'frite-bot';
