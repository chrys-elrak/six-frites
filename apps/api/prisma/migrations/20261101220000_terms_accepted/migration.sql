ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- People who joined before the terms were asked for count as having accepted them when they joined.
UPDATE "User" SET "termsAcceptedAt" = "createdAt";
