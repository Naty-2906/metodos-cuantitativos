BEGIN;
CREATE TABLE IF NOT EXISTS "BusinessSchedule" (
 "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY CHECK ("id" = 1),
 "dates" JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE "BusinessSchedule" ENABLE ROW LEVEL SECURITY;
INSERT INTO "BusinessSchedule" ("id", "dates") VALUES (1, '{}'::jsonb) ON CONFLICT ("id") DO NOTHING;
COMMIT;
