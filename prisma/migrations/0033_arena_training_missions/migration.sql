CREATE TYPE "ArenaOccupationKind" AS ENUM ('TRAINING', 'MISSION');
CREATE TYPE "ArenaOccupationStatus" AS ENUM ('ACTIVE', 'COMPLETED');
CREATE TYPE "ArenaIncidentKind" AS ENUM ('ROBBED', 'BRUISED', 'EXHAUSTED');

CREATE TABLE "ArenaOccupation" (
    "id" UUID NOT NULL,
    "gladiatorId" UUID NOT NULL,
    "taskKey" VARCHAR(48) NOT NULL,
    "kind" "ArenaOccupationKind" NOT NULL,
    "status" "ArenaOccupationStatus" NOT NULL DEFAULT 'ACTIVE',
    "durationHours" INTEGER NOT NULL,
    "goldReward" INTEGER NOT NULL DEFAULT 0,
    "experienceReward" INTEGER NOT NULL DEFAULT 0,
    "shelterPointsReward" INTEGER NOT NULL DEFAULT 0,
    "incident" "ArenaIncidentKind",
    "resultMessage" VARCHAR(240),
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "finishedAt" TIMESTAMPTZ(6),
    "effectExpiresAt" TIMESTAMPTZ(6),

    CONSTRAINT "ArenaOccupation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaOccupation_values_check" CHECK (
        "durationHours" > 0
        AND "goldReward" >= 0
        AND "experienceReward" >= 0
        AND "shelterPointsReward" >= 0
        AND "endsAt" > "startedAt"
    ),
    CONSTRAINT "ArenaOccupation_completion_check" CHECK (
        ("status" = 'ACTIVE' AND "finishedAt" IS NULL)
        OR ("status" = 'COMPLETED' AND "finishedAt" IS NOT NULL)
    )
);

ALTER TABLE "ArenaOccupation"
ADD CONSTRAINT "ArenaOccupation_gladiatorId_fkey"
FOREIGN KEY ("gladiatorId") REFERENCES "ArenaGladiator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ArenaOccupation_one_active_per_gladiator"
ON "ArenaOccupation"("gladiatorId")
WHERE "status" = 'ACTIVE';

CREATE INDEX "ArenaOccupation_gladiatorId_status_endsAt_idx"
ON "ArenaOccupation"("gladiatorId", "status", "endsAt");

CREATE INDEX "ArenaOccupation_gladiatorId_finishedAt_id_idx"
ON "ArenaOccupation"("gladiatorId", "finishedAt", "id");

CREATE INDEX "ArenaOccupation_effectExpiresAt_idx"
ON "ArenaOccupation"("effectExpiresAt");
