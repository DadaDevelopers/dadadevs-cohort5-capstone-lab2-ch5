-- Preserve existing communities while adding a unique, required join code.
ALTER TABLE "Community" ADD COLUMN "joinCode" TEXT;

UPDATE "Community"
SET "joinCode" = 'DADA-' || upper(substr(md5(random()::text || clock_timestamp()::text || "id"::text), 1, 12));

ALTER TABLE "Community" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "Community_joinCode_key" ON "Community"("joinCode");
