CREATE FUNCTION pair_alias(viewer TEXT, subject TEXT) RETURNS TEXT AS $$
  SELECT 'Frite ' || lpad((('x' || substr(md5(viewer || ':' || subject), 1, 7))::bit(28)::int % 10000)::text, 4, '0')
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE "User" DROP COLUMN "alias";
DROP FUNCTION random_alias();

ALTER TABLE "ContactOverride" ADD COLUMN "label" TEXT;
