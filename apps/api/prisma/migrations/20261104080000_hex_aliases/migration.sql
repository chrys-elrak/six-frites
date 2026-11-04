ALTER TABLE "User" ADD COLUMN "hexAlias" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "hexAlias" SET DEFAULT true;

DROP FUNCTION pair_alias(TEXT, TEXT);
CREATE FUNCTION pair_alias(viewer TEXT, subject TEXT, hex BOOLEAN) RETURNS TEXT AS $$
  SELECT CASE WHEN hex
    THEN '#' || upper(substr(md5(viewer || ':' || subject), 1, 6))
    ELSE 'Frite ' || lpad((('x' || substr(md5(viewer || ':' || subject), 1, 7))::bit(28)::int % 10000)::text, 4, '0')
  END
$$ LANGUAGE SQL IMMUTABLE;
