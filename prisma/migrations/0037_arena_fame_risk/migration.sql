ALTER TABLE "ArenaGladiator"
DROP CONSTRAINT "ArenaGladiator_progress_check";

ALTER TABLE "ArenaGladiator"
ADD CONSTRAINT "ArenaGladiator_progress_check" CHECK (
    "level" >= 1 AND "experience" >= 0 AND "gold" >= 0 AND "fame" >= -1
    AND "unspentSkillPoints" >= 0 AND "wins" >= 0 AND "losses" >= 0
);

ALTER TABLE "ArenaBattle"
DROP CONSTRAINT "ArenaBattle_rewards_check";

ALTER TABLE "ArenaBattle"
ADD CONSTRAINT "ArenaBattle_rewards_check" CHECK (
    "goldReward" >= 0
    AND "experienceReward" >= 0
    AND "fameReward" >= -1
    AND "skillPointsReward" >= 0
);
