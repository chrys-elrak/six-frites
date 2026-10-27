UPDATE "User" SET "contactPinHash" = NULL WHERE NOT "appLock";
ALTER TABLE "User" RENAME COLUMN "contactPinHash" TO "appLockHash";
ALTER TABLE "User" DROP COLUMN "appLock";
