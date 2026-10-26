-- Keep existing communities and memberships. Give later duplicates a distinct name
-- before enforcing case-insensitive uniqueness; the lowest ID keeps its name.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY lower(btrim("name")) ORDER BY "id") AS occurrence
  FROM "Community"
)
UPDATE "Community" AS community
SET "name" = left(btrim(community."name"), 100 - char_length(' (community ' || community."id" || ')'))
             || ' (community ' || community."id" || ')'
FROM ranked
WHERE community."id" = ranked."id" AND ranked.occurrence > 1;

CREATE UNIQUE INDEX "Community_name_normalized_key" ON "Community" (lower(btrim("name")));
