-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "spoiler" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ContactOverride" (
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "displayName" TEXT,
    "photo" BYTEA,
    "photoMime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactOverride_pkey" PRIMARY KEY ("ownerId","contactId")
);

-- AddForeignKey
ALTER TABLE "ContactOverride" ADD CONSTRAINT "ContactOverride_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactOverride" ADD CONSTRAINT "ContactOverride_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom names sort and compare like real names.
ALTER TABLE "ContactOverride" ALTER COLUMN "displayName" TYPE TEXT COLLATE "und-x-icu";
