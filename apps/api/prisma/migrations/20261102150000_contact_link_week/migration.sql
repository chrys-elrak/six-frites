-- Reusable codes now last a week at most: the ones kept until deleted, or set further out, stop in a week.
UPDATE "ContactLink" SET "expiresAt" = now() + interval '7 days'
WHERE "expiresAt" IS NULL OR "expiresAt" > now() + interval '7 days';

ALTER TABLE "ContactLink" ALTER COLUMN "expiresAt" SET NOT NULL;
