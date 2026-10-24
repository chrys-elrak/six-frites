-- Sort and compare display names alphabetically regardless of case and accents.
ALTER TABLE "User" ALTER COLUMN "displayName" TYPE TEXT COLLATE "und-x-icu";
