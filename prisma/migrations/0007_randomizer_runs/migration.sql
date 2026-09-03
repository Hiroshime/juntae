CREATE TYPE "RandomizerPresetType" AS ENUM (
  'TEAMS',
  'GROUPS',
  'CARS',
  'ASSIGN_ITEMS',
  'PICK_PEOPLE',
  'PICK_ITEM',
  'RANDOM_ORDER',
  'PAIRS'
);

CREATE TABLE "RandomizerRun" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "presetType" "RandomizerPresetType" NOT NULL,
  "title" VARCHAR(160),
  "configuration" JSONB NOT NULL,
  "inputSnapshot" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RandomizerRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RandomizerRun_communityId_createdAt_idx"
ON "RandomizerRun"("communityId", "createdAt");

CREATE INDEX "RandomizerRun_createdById_idx"
ON "RandomizerRun"("createdById");

ALTER TABLE "RandomizerRun"
ADD CONSTRAINT "RandomizerRun_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RandomizerRun"
ADD CONSTRAINT "RandomizerRun_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
