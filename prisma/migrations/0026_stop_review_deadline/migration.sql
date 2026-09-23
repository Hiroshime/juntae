ALTER TABLE "StopRound"
  ADD COLUMN "reviewDeadline" TIMESTAMPTZ(6);

-- Preserve any review that was active during the deployment and give it a fresh full window.
UPDATE "StopRound"
SET "reviewDeadline" = CURRENT_TIMESTAMP + INTERVAL '20 seconds'
WHERE "status" = 'REVIEWING';

ALTER TABLE "StopRound"
  DROP CONSTRAINT "StopRound_state_check";

ALTER TABLE "StopRound"
  ADD CONSTRAINT "StopRound_state_check" CHECK (
    ("status" = 'ANSWERING' AND "reviewStartedAt" IS NULL AND "reviewDeadline" IS NULL AND "finishedAt" IS NULL)
    OR ("status" = 'REVIEWING' AND "reviewStartedAt" IS NOT NULL AND "reviewDeadline" IS NOT NULL AND "finishedAt" IS NULL)
    OR ("status" = 'FINISHED' AND "reviewStartedAt" IS NOT NULL AND "reviewDeadline" IS NULL AND "finishedAt" IS NOT NULL)
  );
