-- Preserve existing whole-number scores while allowing one decimal place for metric scoring.
ALTER TABLE "ChallengeActivity"
  DROP CONSTRAINT "ChallengeActivity_values_check";

ALTER TABLE "ChallengeActivity"
  ALTER COLUMN "score" TYPE DECIMAL(18, 1)
  USING "score"::DECIMAL(18, 1);

ALTER TABLE "ChallengeResult"
  ALTER COLUMN "score" TYPE DECIMAL(18, 1)
  USING "score"::DECIMAL(18, 1);

ALTER TABLE "ChallengeActivity"
  ADD CONSTRAINT "ChallengeActivity_values_check"
  CHECK (
    "durationSeconds" BETWEEN 1 AND 86400
    AND ("distanceMeters" IS NULL OR "distanceMeters" BETWEEN 0 AND 1000000)
    AND "score" >= 0
  );
