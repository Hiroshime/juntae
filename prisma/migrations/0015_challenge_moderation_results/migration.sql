ALTER TABLE "Challenge" ADD COLUMN "finalizedAt" TIMESTAMPTZ(6), ADD COLUMN "finalizedByName" VARCHAR(160);
ALTER TABLE "ChallengeActivity"
  ADD COLUMN "invalidatedAt" TIMESTAMPTZ(6),
  ADD COLUMN "moderationReason" VARCHAR(1000),
  ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "ChallengeAuditAction" AS ENUM ('INVALIDATE', 'RESTORE', 'REMOVE', 'FINALIZE');
CREATE TABLE "ChallengeResult" (
  "challengeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "score" BIGINT NOT NULL,
  "activityCount" INTEGER NOT NULL,
  "position" INTEGER,
  CONSTRAINT "ChallengeResult_pkey" PRIMARY KEY ("challengeId", "userId"),
  CONSTRAINT "ChallengeResult_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChallengeResult_challengeId_score_name_userId_idx" ON "ChallengeResult"("challengeId", "score", "name", "userId");
CREATE TABLE "ChallengeAuditLog" (
  "id" UUID NOT NULL,
  "challengeId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "actorName" VARCHAR(160) NOT NULL,
  "action" "ChallengeAuditAction" NOT NULL,
  "activityId" UUID,
  "activityTitle" VARCHAR(160),
  "participantName" VARCHAR(160),
  "reason" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChallengeAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChallengeAuditLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChallengeAuditLog_challengeId_createdAt_id_idx" ON "ChallengeAuditLog"("challengeId", "createdAt", "id");
