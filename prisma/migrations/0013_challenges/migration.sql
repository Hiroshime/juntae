CREATE TABLE "Challenge" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "rules" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "configuration" JSONB NOT NULL,
  "firstJoinedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Challenge_dates_check" CHECK ("endDate" >= "startDate" AND "endDate" - "startDate" <= 365),
  CONSTRAINT "Challenge_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Challenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Challenge_id_communityId_key" ON "Challenge"("id", "communityId");
CREATE INDEX "Challenge_communityId_createdAt_id_idx" ON "Challenge"("communityId", "createdAt", "id");
CREATE INDEX "Challenge_createdById_idx" ON "Challenge"("createdById");

CREATE TABLE "ChallengeParticipant" (
  "challengeId" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMPTZ(6),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("challengeId", "userId"),
  CONSTRAINT "ChallengeParticipant_challengeId_communityId_fkey" FOREIGN KEY ("challengeId", "communityId") REFERENCES "Challenge"("id", "communityId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChallengeParticipant_communityId_userId_fkey" FOREIGN KEY ("communityId", "userId") REFERENCES "CommunityMember"("communityId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChallengeParticipant_communityId_userId_idx" ON "ChallengeParticipant"("communityId", "userId");
CREATE INDEX "ChallengeParticipant_challengeId_leftAt_joinedAt_userId_idx" ON "ChallengeParticipant"("challengeId", "leftAt", "joinedAt", "userId");
