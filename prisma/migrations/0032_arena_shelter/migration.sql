ALTER TABLE "ArenaBattle"
ADD COLUMN "shelterPointsReward" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "ArenaBattle_shelter_points_reward_check" CHECK (
    "shelterPointsReward" >= 0
);

CREATE TABLE "ArenaShelter" (
    "gladiatorId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaShelter_pkey" PRIMARY KEY ("gladiatorId"),
    CONSTRAINT "ArenaShelter_progress_check" CHECK (
        "level" BETWEEN 1 AND 6
        AND "points" >= 0
    )
);

INSERT INTO "ArenaShelter" ("gladiatorId")
SELECT "id" FROM "ArenaGladiator";

ALTER TABLE "ArenaShelter"
ADD CONSTRAINT "ArenaShelter_gladiatorId_fkey"
FOREIGN KEY ("gladiatorId") REFERENCES "ArenaGladiator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ArenaShelter_level_points_idx"
ON "ArenaShelter"("level", "points");
