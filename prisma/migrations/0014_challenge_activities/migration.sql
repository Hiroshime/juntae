CREATE TABLE "ChallengeActivity" (
  "id" UUID NOT NULL,
  "challengeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "clientRequestId" UUID NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "notes" VARCHAR(2000),
  "activityType" VARCHAR(32) NOT NULL,
  "performedOn" DATE NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "distanceMeters" INTEGER,
  "score" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(6),
  CONSTRAINT "ChallengeActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChallengeActivity_values_check" CHECK ("durationSeconds" BETWEEN 1 AND 86400 AND ("distanceMeters" IS NULL OR "distanceMeters" BETWEEN 0 AND 1000000) AND "score" > 0),
  CONSTRAINT "ChallengeActivity_challengeId_userId_fkey" FOREIGN KEY ("challengeId", "userId") REFERENCES "ChallengeParticipant"("challengeId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChallengeActivity_challengeId_userId_clientRequestId_key" ON "ChallengeActivity"("challengeId", "userId", "clientRequestId");
CREATE INDEX "ChallengeActivity_challengeId_deletedAt_createdAt_id_idx" ON "ChallengeActivity"("challengeId", "deletedAt", "createdAt", "id");
CREATE INDEX "ChallengeActivity_challengeId_userId_performedOn_deletedAt_idx" ON "ChallengeActivity"("challengeId", "userId", "performedOn", "deletedAt");
CREATE TABLE "ChallengeActivityPhoto" (
  "id" UUID NOT NULL,
  "activityId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChallengeActivityPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChallengeActivityPhoto_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ChallengeActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChallengeActivityPhoto_activityId_sortOrder_idx" ON "ChallengeActivityPhoto"("activityId", "sortOrder");
