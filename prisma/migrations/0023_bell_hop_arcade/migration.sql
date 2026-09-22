CREATE TYPE "BellHopRunStatus" AS ENUM ('ACTIVE', 'FINISHED', 'ABANDONED');

CREATE TABLE "BellHopRun" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "playerName" VARCHAR(80) NOT NULL,
    "status" "BellHopRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "seed" INTEGER NOT NULL,
    "score" INTEGER,
    "bellsHit" INTEGER,
    "maxHeight" INTEGER,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    CONSTRAINT "BellHopRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BellHopRun_seed_check" CHECK ("seed" > 0),
    CONSTRAINT "BellHopRun_metrics_check" CHECK (
      ("score" IS NULL OR "score" >= 0)
      AND ("bellsHit" IS NULL OR "bellsHit" BETWEEN 0 AND 5000)
      AND ("maxHeight" IS NULL OR "maxHeight" BETWEEN 0 AND 1000000)
      AND ("durationMs" IS NULL OR "durationMs" BETWEEN 0 AND 14400000)
    ),
    CONSTRAINT "BellHopRun_state_check" CHECK (
      ("status" = 'ACTIVE' AND "score" IS NULL AND "bellsHit" IS NULL AND "maxHeight" IS NULL AND "durationMs" IS NULL AND "finishedAt" IS NULL)
      OR ("status" = 'FINISHED' AND "score" IS NOT NULL AND "bellsHit" IS NOT NULL AND "maxHeight" IS NOT NULL AND "durationMs" IS NOT NULL AND "finishedAt" IS NOT NULL)
      OR ("status" = 'ABANDONED' AND "score" IS NULL AND "bellsHit" IS NULL AND "maxHeight" IS NULL AND "durationMs" IS NULL AND "finishedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "BellHopRun_one_active_per_member_key" ON "BellHopRun"("communityId", "userId") WHERE "status" = 'ACTIVE';
CREATE INDEX "BellHopRun_communityId_status_finishedAt_score_id_idx" ON "BellHopRun"("communityId", "status", "finishedAt", "score", "id");
CREATE INDEX "BellHopRun_communityId_userId_startedAt_idx" ON "BellHopRun"("communityId", "userId", "startedAt");
CREATE INDEX "BellHopRun_userId_idx" ON "BellHopRun"("userId");

ALTER TABLE "BellHopRun" ADD CONSTRAINT "BellHopRun_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BellHopRun" ADD CONSTRAINT "BellHopRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
