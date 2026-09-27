ALTER TABLE "ArenaGladiator" DROP COLUMN "pronouns";

ALTER TABLE "ArenaBattle"
ADD COLUMN "goldReward" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "experienceReward" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "fameReward" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "skillPointsReward" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "ArenaBattle_rewards_check" CHECK (
    "goldReward" >= 0
    AND "experienceReward" >= 0
    AND "fameReward" >= 0
    AND "skillPointsReward" >= 0
);

CREATE UNIQUE INDEX "ArenaInventoryItem_gladiatorId_catalogItemKey_key"
ON "ArenaInventoryItem"("gladiatorId", "catalogItemKey");
