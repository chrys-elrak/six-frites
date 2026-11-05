UPDATE "Message" m
SET action = jsonb_set(m.action, '{from}', to_jsonb(COALESCE(
  (SELECT o."displayName" FROM "ContactOverride" o WHERE o."ownerId" = r."userId" AND o."contactId" = m."senderId"),
  pair_alias(r."userId", m."senderId")
)))
FROM "ChatMember" r
WHERE r."chatId" = m."chatId"
  AND r."userId" <> m."senderId"
  AND m.action->>'type' = 'live_invite'
  AND m.action->>'from' ~ '^Frite [0-9]{4}$';

DROP FUNCTION pair_alias(TEXT, TEXT, BOOLEAN);
ALTER TABLE "User" DROP COLUMN "hexAlias";
ALTER TABLE "ContactOverride" DROP COLUMN "hexAlias";
