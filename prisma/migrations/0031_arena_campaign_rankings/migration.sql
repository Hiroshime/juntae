ALTER TABLE "ArenaGladiator"
ADD COLUMN "campaignStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "campaignCompletions" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "ArenaGladiator_campaign_check" CHECK (
    "campaignStep" BETWEEN 0 AND 3
    AND "campaignCompletions" >= 0
);

CREATE INDEX "ArenaGladiator_communityId_campaignCompletions_fame_wins_id_idx"
ON "ArenaGladiator"("communityId", "campaignCompletions", "fame", "wins", "id");
