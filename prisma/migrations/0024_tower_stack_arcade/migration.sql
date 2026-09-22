CREATE TYPE "TowerStackRunStatus" AS ENUM ('ACTIVE', 'FINISHED', 'ABANDONED');

CREATE TABLE "TowerStackRun" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "playerName" VARCHAR(80) NOT NULL,
    "status" "TowerStackRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER NOT NULL,
    "score" INTEGER,
    "blocksPlaced" INTEGER,
    "maxHeight" INTEGER,
    "livesRemaining" INTEGER,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    CONSTRAINT "TowerStackRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TowerStackRun_seed_check" CHECK ("seed" > 0),
    CONSTRAINT "TowerStackRun_metrics_check" CHECK (
      ("score" IS NULL OR "score" >= 0)
      AND ("blocksPlaced" IS NULL OR "blocksPlaced" BETWEEN 0 AND 1000)
      AND ("maxHeight" IS NULL OR "maxHeight" BETWEEN 0 AND 100000)
      AND ("livesRemaining" IS NULL OR "livesRemaining" BETWEEN 0 AND 3)
      AND ("durationMs" IS NULL OR "durationMs" BETWEEN 0 AND 14400000)
    ),
    CONSTRAINT "TowerStackRun_state_check" CHECK (
      ("status" = 'ACTIVE' AND "score" IS NULL AND "blocksPlaced" IS NULL AND "maxHeight" IS NULL AND "livesRemaining" IS NULL AND "durationMs" IS NULL AND "finishedAt" IS NULL)
      OR ("status" = 'FINISHED' AND "score" IS NOT NULL AND "blocksPlaced" IS NOT NULL AND "maxHeight" IS NOT NULL AND "livesRemaining" = 0 AND "durationMs" IS NOT NULL AND "finishedAt" IS NOT NULL)
      OR ("status" = 'ABANDONED' AND "score" IS NULL AND "blocksPlaced" IS NULL AND "maxHeight" IS NULL AND "livesRemaining" IS NULL AND "durationMs" IS NULL AND "finishedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "TowerStackRun_one_active_per_member_key" ON "TowerStackRun"("communityId", "userId") WHERE "status" = 'ACTIVE';
CREATE INDEX "TowerStackRun_communityId_status_finishedAt_score_id_idx" ON "TowerStackRun"("communityId", "status", "finishedAt", "score", "id");
CREATE INDEX "TowerStackRun_communityId_userId_startedAt_idx" ON "TowerStackRun"("communityId", "userId", "startedAt");
CREATE INDEX "TowerStackRun_userId_idx" ON "TowerStackRun"("userId");

ALTER TABLE "TowerStackRun" ADD CONSTRAINT "TowerStackRun_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TowerStackRun" ADD CONSTRAINT "TowerStackRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
