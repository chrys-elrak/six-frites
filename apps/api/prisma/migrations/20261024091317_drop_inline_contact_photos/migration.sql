/*
  Warnings:

  - You are about to drop the column `photo` on the `ContactOverride` table. All the data in the column will be lost.
  - You are about to drop the column `photoMime` on the `ContactOverride` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ContactOverride" DROP COLUMN "photo",
DROP COLUMN "photoMime";
