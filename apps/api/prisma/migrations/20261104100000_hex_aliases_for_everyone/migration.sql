UPDATE "User" SET "hexAlias" = true WHERE NOT "hexAlias";
DELETE FROM "ContactOverride" WHERE "displayName" IS NULL AND "photoKey" IS NULL AND "label" IS NULL;

CREATE FUNCTION pair_alias(viewer TEXT, subject TEXT) RETURNS TEXT AS $$
  SELECT '#' || upper(substr(md5(viewer || ':' || subject), 1, 6))
$$ LANGUAGE SQL IMMUTABLE;
