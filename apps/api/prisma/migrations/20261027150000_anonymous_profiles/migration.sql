CREATE FUNCTION random_alias() RETURNS TEXT AS $$
  SELECT 'Frite ' || lpad(floor(random() * 10000)::int::text, 4, '0')
$$ LANGUAGE SQL VOLATILE;

ALTER TABLE "User" ADD COLUMN "alias" TEXT NOT NULL DEFAULT random_alias();
UPDATE "User" SET "alias" = 'Deleted account' WHERE "deletedAt" IS NOT NULL;

ALTER TABLE "ChatMember" ADD COLUMN "showProfile" BOOLEAN NOT NULL DEFAULT false;
