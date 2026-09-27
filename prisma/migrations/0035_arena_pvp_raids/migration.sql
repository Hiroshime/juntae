CREATE TYPE "ArenaPvpRaidStatus" AS ENUM ('ACTIVE', 'ATTACKER_WON', 'DEFENDER_WON');

ALTER TABLE "ArenaGladiator"
ADD COLUMN "injuredUntil" TIMESTAMPTZ(6);

CREATE TABLE "ArenaPvpRaid" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "attackerId" UUID NOT NULL,
    "defenderId" UUID NOT NULL,
    "status" "ArenaPvpRaidStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationMinutes" INTEGER NOT NULL,
    "goldStolen" INTEGER NOT NULL DEFAULT 0,
    "experienceReward" INTEGER NOT NULL DEFAULT 0,
    "attackerScore" INTEGER,
    "defenderScore" INTEGER,
    "attackerSnapshot" JSONB NOT NULL,
    "defenderSnapshot" JSONB NOT NULL,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(6),
    "injuryEndsAt" TIMESTAMPTZ(6),

    CONSTRAINT "ArenaPvpRaid_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaPvpRaid_distinct_gladiators_check" CHECK ("attackerId" <> "defenderId"),
    CONSTRAINT "ArenaPvpRaid_duration_check" CHECK ("durationMinutes" BETWEEN 30 AND 120),
    CONSTRAINT "ArenaPvpRaid_rewards_check" CHECK ("goldStolen" >= 0 AND "experienceReward" >= 0)
);

ALTER TABLE "ArenaPvpRaid"
ADD CONSTRAINT "ArenaPvpRaid_attackerId_fkey"
FOREIGN KEY ("attackerId") REFERENCES "ArenaGladiator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArenaPvpRaid"
ADD CONSTRAINT "ArenaPvpRaid_defenderId_fkey"
FOREIGN KEY ("defenderId") REFERENCES "ArenaGladiator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ArenaPvpRaid_one_active_attacker_idx"
ON "ArenaPvpRaid"("attackerId") WHERE "status" = 'ACTIVE';

CREATE INDEX "ArenaPvpRaid_communityId_status_endsAt_idx"
ON "ArenaPvpRaid"("communityId", "status", "endsAt");

CREATE INDEX "ArenaPvpRaid_attackerId_startedAt_id_idx"
ON "ArenaPvpRaid"("attackerId", "startedAt", "id");

CREATE INDEX "ArenaPvpRaid_defenderId_startedAt_id_idx"
ON "ArenaPvpRaid"("defenderId", "startedAt", "id");

CREATE INDEX "ArenaGladiator_injuredUntil_idx"
ON "ArenaGladiator"("injuredUntil");
