ALTER TABLE "User" ADD COLUMN "providers" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "User" SET "providers" = ARRAY['google'] WHERE "googleSub" IS NOT NULL;
UPDATE "User" SET "providers" = "providers" || ARRAY['facebook'] WHERE "firebaseUid" IS NOT NULL AND "googleSub" IS NULL;
