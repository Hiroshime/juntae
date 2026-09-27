CREATE TYPE "ArenaBattleStatus" AS ENUM ('ACTIVE', 'WON', 'LOST', 'ABANDONED');
CREATE TYPE "ArenaBattleAction" AS ENUM (
    'ADVANCE',
    'RETREAT',
    'QUICK_STRIKE',
    'POWER_STRIKE',
    'GUARD',
    'RECOVER'
);
CREATE TYPE "ArenaBattleActor" AS ENUM ('PLAYER', 'OPPONENT');

CREATE TABLE "ArenaBattle" (
    "id" UUID NOT NULL,
    "gladiatorId" UUID NOT NULL,
    "opponentKey" VARCHAR(48) NOT NULL,
    "status" "ArenaBattleStatus" NOT NULL DEFAULT 'ACTIVE',
    "round" INTEGER NOT NULL DEFAULT 1,
    "playerHealth" INTEGER NOT NULL,
    "playerEnergy" INTEGER NOT NULL,
    "playerPosition" INTEGER NOT NULL DEFAULT 2,
    "playerGuarded" BOOLEAN NOT NULL DEFAULT false,
    "opponentHealth" INTEGER NOT NULL,
    "opponentEnergy" INTEGER NOT NULL,
    "opponentPosition" INTEGER NOT NULL DEFAULT 8,
    "opponentGuarded" BOOLEAN NOT NULL DEFAULT false,
    "playerSnapshot" JSONB NOT NULL,
    "opponentSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "ArenaBattle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaBattle_round_check" CHECK ("round" >= 1),
    CONSTRAINT "ArenaBattle_resources_check" CHECK (
        "playerHealth" >= 0 AND "playerEnergy" >= 0
        AND "opponentHealth" >= 0 AND "opponentEnergy" >= 0
    ),
    CONSTRAINT "ArenaBattle_positions_check" CHECK (
        "playerPosition" BETWEEN 0 AND 10
        AND "opponentPosition" BETWEEN 0 AND 10
        AND "playerPosition" < "opponentPosition"
    )
);

CREATE TABLE "ArenaBattleTurn" (
    "id" UUID NOT NULL,
    "battleId" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "playerAction" "ArenaBattleAction" NOT NULL,
    "opponentAction" "ArenaBattleAction" NOT NULL,
    "actingFirst" "ArenaBattleActor" NOT NULL,
    "events" JSONB NOT NULL,
    "playerHealth" INTEGER NOT NULL,
    "playerEnergy" INTEGER NOT NULL,
    "playerPosition" INTEGER NOT NULL,
    "opponentHealth" INTEGER NOT NULL,
    "opponentEnergy" INTEGER NOT NULL,
    "opponentPosition" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaBattleTurn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaBattleTurn_round_check" CHECK ("round" >= 1),
    CONSTRAINT "ArenaBattleTurn_resources_check" CHECK (
        "playerHealth" >= 0 AND "playerEnergy" >= 0
        AND "opponentHealth" >= 0 AND "opponentEnergy" >= 0
    ),
    CONSTRAINT "ArenaBattleTurn_positions_check" CHECK (
        "playerPosition" BETWEEN 0 AND 10
        AND "opponentPosition" BETWEEN 0 AND 10
        AND "playerPosition" < "opponentPosition"
    )
);

CREATE INDEX "ArenaBattle_gladiatorId_status_createdAt_idx"
ON "ArenaBattle"("gladiatorId", "status", "createdAt");
CREATE UNIQUE INDEX "ArenaBattle_one_active_per_gladiator_idx"
ON "ArenaBattle"("gladiatorId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "ArenaBattleTurn_battleId_round_key"
ON "ArenaBattleTurn"("battleId", "round");
CREATE INDEX "ArenaBattleTurn_battleId_createdAt_idx"
ON "ArenaBattleTurn"("battleId", "createdAt");

ALTER TABLE "ArenaBattle" ADD CONSTRAINT "ArenaBattle_gladiatorId_fkey"
FOREIGN KEY ("gladiatorId") REFERENCES "ArenaGladiator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArenaBattleTurn" ADD CONSTRAINT "ArenaBattleTurn_battleId_fkey"
FOREIGN KEY ("battleId") REFERENCES "ArenaBattle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
