ALTER TABLE "Sticker" ADD COLUMN "name" TEXT;

UPDATE "Sticker" s SET "name" = regexp_replace(u."name", '\.[^.]+$', '')
FROM "Upload" u WHERE s."uploadId" = u."id";
