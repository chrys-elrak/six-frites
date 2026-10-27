UPDATE "User" SET "contactPinHash" = "appLockHash" WHERE "contactPinHash" IS NULL AND "appLockHash" IS NOT NULL;
ALTER TABLE "User" ADD COLUMN "appLock" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "appLock" = true WHERE "appLockHash" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "appLockHash";
