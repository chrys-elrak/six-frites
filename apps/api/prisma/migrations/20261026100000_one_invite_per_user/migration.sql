-- Keep one invite per user: the newest one still usable, else the newest. Its referrals move over.
CREATE TEMP TABLE kept_invite AS
SELECT DISTINCT ON ("creatorId") id, "creatorId"
FROM "Invite"
ORDER BY "creatorId",
         (("expiresAt" IS NULL OR "expiresAt" > now()) AND ("maxUses" IS NULL OR uses < "maxUses")) DESC,
         "createdAt" DESC,
         id DESC;

UPDATE "Referral" r SET "inviteId" = k.id
FROM "Invite" i JOIN kept_invite k ON k."creatorId" = i."creatorId"
WHERE r."inviteId" = i.id AND i.id <> k.id;

DELETE FROM "Invite" WHERE id NOT IN (SELECT id FROM kept_invite);

UPDATE "Invite" i SET "maxUses" = NULL, "expiresAt" = NULL,
  uses = (SELECT count(*) FROM "Referral" r WHERE r."inviteId" = i.id);

DROP TABLE kept_invite;

-- CreateIndex
CREATE UNIQUE INDEX "Invite_creatorId_key" ON "Invite"("creatorId");
