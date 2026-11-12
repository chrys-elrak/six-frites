ALTER TABLE "User" ADD COLUMN "firebaseUid" TEXT;
ALTER TABLE "User" ALTER COLUMN "googleSub" DROP NOT NULL;
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
