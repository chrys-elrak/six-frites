-- AlterTable
ALTER TABLE "User" ADD COLUMN     "anonMailAt" TIMESTAMP(3),
ADD COLUMN     "inactiveMailAt" TIMESTAMP(3),
ADD COLUMN     "mailOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Poke" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poke_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Poke_fromId_createdAt_idx" ON "Poke"("fromId", "createdAt");

-- CreateIndex
CREATE INDEX "Poke_toId_createdAt_idx" ON "Poke"("toId", "createdAt");

-- AddForeignKey
ALTER TABLE "Poke" ADD CONSTRAINT "Poke_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poke" ADD CONSTRAINT "Poke_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

