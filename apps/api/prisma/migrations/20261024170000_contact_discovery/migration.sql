-- CreateFunction
CREATE FUNCTION random_code() RETURNS TEXT AS $$
  SELECT string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
  FROM generate_series(1, 8)
$$ LANGUAGE SQL VOLATILE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "contactCode" TEXT NOT NULL DEFAULT random_code(),
ADD COLUMN     "findByEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_contactCode_key" ON "User"("contactCode");
