-- Backfill existing communities before making the new field required.
ALTER TABLE "Community" ADD COLUMN "description" TEXT;

UPDATE "Community"
SET "description" = 'Description not provided.'
WHERE "description" IS NULL;

ALTER TABLE "Community" ALTER COLUMN "description" SET NOT NULL;
