ALTER TYPE "GameType" ADD VALUE 'STOP';

CREATE TYPE "StopSessionStatus" AS ENUM ('ACTIVE', 'FINISHED', 'CANCELLED');
CREATE TYPE "StopRoundStatus" AS ENUM ('ANSWERING', 'REVIEWING', 'FINISHED');

ALTER TABLE "GameRoomPlayer" DROP CONSTRAINT "GameRoomPlayer_seat_check";
ALTER TABLE "GameRoomPlayer"
  ADD CONSTRAINT "GameRoomPlayer_seat_check" CHECK ("seat" BETWEEN 1 AND 10);

CREATE TABLE "StopSession" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "status" "StopSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalRounds" INTEGER NOT NULL,
    "answerSeconds" INTEGER NOT NULL,
    "currentRoundNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancellationReason" VARCHAR(160),
    CONSTRAINT "StopSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StopSession_totalRounds_check" CHECK ("totalRounds" BETWEEN 4 AND 10),
    CONSTRAINT "StopSession_answerSeconds_check" CHECK ("answerSeconds" IN (15, 20, 25, 30)),
    CONSTRAINT "StopSession_currentRoundNumber_check" CHECK ("currentRoundNumber" BETWEEN 1 AND "totalRounds"),
    CONSTRAINT "StopSession_state_check" CHECK (
      ("status" = 'ACTIVE' AND "finishedAt" IS NULL AND "cancelledAt" IS NULL)
      OR ("status" = 'FINISHED' AND "finishedAt" IS NOT NULL AND "cancelledAt" IS NULL)
      OR ("status" = 'CANCELLED' AND "finishedAt" IS NULL AND "cancelledAt" IS NOT NULL)
    )
);

CREATE TABLE "StopSessionPlayer" (
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "seat" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StopSessionPlayer_pkey" PRIMARY KEY ("sessionId", "userId"),
    CONSTRAINT "StopSessionPlayer_seat_check" CHECK ("seat" BETWEEN 1 AND 10),
    CONSTRAINT "StopSessionPlayer_score_check" CHECK ("score" >= 0)
);

CREATE TABLE "StopCategory" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "StopCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StopCategory_sortOrder_check" CHECK ("sortOrder" BETWEEN 0 AND 19)
);

CREATE TABLE "StopRound" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "letter" CHAR(1) NOT NULL,
    "status" "StopRoundStatus" NOT NULL DEFAULT 'ANSWERING',
    "reviewCategoryIndex" INTEGER NOT NULL DEFAULT 0,
    "answerDeadline" TIMESTAMPTZ(6) NOT NULL,
    "bonusDeadline" TIMESTAMPTZ(6) NOT NULL,
    "stoppedById" UUID,
    "stoppedByName" VARCHAR(80),
    "stoppedAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewStartedAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    CONSTRAINT "StopRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StopRound_roundNumber_check" CHECK ("roundNumber" BETWEEN 1 AND 10),
    CONSTRAINT "StopRound_reviewCategoryIndex_check" CHECK ("reviewCategoryIndex" BETWEEN 0 AND 19),
    CONSTRAINT "StopRound_deadline_check" CHECK ("bonusDeadline" = "answerDeadline" + INTERVAL '10 seconds'),
    CONSTRAINT "StopRound_stopper_check" CHECK (
      ("stoppedById" IS NULL AND "stoppedByName" IS NULL AND "stoppedAt" IS NULL)
      OR ("stoppedById" IS NOT NULL AND "stoppedByName" IS NOT NULL AND "stoppedAt" IS NOT NULL)
    ),
    CONSTRAINT "StopRound_state_check" CHECK (
      ("status" = 'ANSWERING' AND "reviewStartedAt" IS NULL AND "finishedAt" IS NULL)
      OR ("status" = 'REVIEWING' AND "reviewStartedAt" IS NOT NULL AND "finishedAt" IS NULL)
      OR ("status" = 'FINISHED' AND "reviewStartedAt" IS NOT NULL AND "finishedAt" IS NOT NULL)
    )
);

CREATE TABLE "StopAnswer" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userName" VARCHAR(80) NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "normalizedValue" VARCHAR(80) NOT NULL,
    "finalValid" BOOLEAN,
    "awardedPoints" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "StopAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StopAnswer_result_check" CHECK (
      ("finalValid" IS NULL AND "awardedPoints" IS NULL)
      OR ("finalValid" = true AND "awardedPoints" = 1)
      OR ("finalValid" = false AND "awardedPoints" = 0)
    )
);

CREATE TABLE "StopInvalidVote" (
    "answerId" UUID NOT NULL,
    "voterId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StopInvalidVote_pkey" PRIMARY KEY ("answerId", "voterId")
);

CREATE UNIQUE INDEX "StopSession_id_communityId_key" ON "StopSession"("id", "communityId");
CREATE UNIQUE INDEX "StopSession_one_active_per_room_key" ON "StopSession"("roomId") WHERE "status" = 'ACTIVE';
CREATE INDEX "StopSession_communityId_status_finishedAt_id_idx" ON "StopSession"("communityId", "status", "finishedAt", "id");
CREATE INDEX "StopSession_roomId_status_startedAt_idx" ON "StopSession"("roomId", "status", "startedAt");
CREATE UNIQUE INDEX "StopSessionPlayer_sessionId_seat_key" ON "StopSessionPlayer"("sessionId", "seat");
CREATE INDEX "StopSessionPlayer_userId_idx" ON "StopSessionPlayer"("userId");
CREATE UNIQUE INDEX "StopCategory_sessionId_sortOrder_key" ON "StopCategory"("sessionId", "sortOrder");
CREATE INDEX "StopCategory_sessionId_id_idx" ON "StopCategory"("sessionId", "id");
CREATE UNIQUE INDEX "StopRound_sessionId_roundNumber_key" ON "StopRound"("sessionId", "roundNumber");
CREATE INDEX "StopRound_sessionId_status_roundNumber_idx" ON "StopRound"("sessionId", "status", "roundNumber");
CREATE UNIQUE INDEX "StopAnswer_roundId_categoryId_userId_key" ON "StopAnswer"("roundId", "categoryId", "userId");
CREATE INDEX "StopAnswer_roundId_categoryId_idx" ON "StopAnswer"("roundId", "categoryId");
CREATE INDEX "StopAnswer_userId_idx" ON "StopAnswer"("userId");
CREATE INDEX "StopInvalidVote_voterId_idx" ON "StopInvalidVote"("voterId");

ALTER TABLE "StopSession" ADD CONSTRAINT "StopSession_roomId_communityId_fkey" FOREIGN KEY ("roomId", "communityId") REFERENCES "GameRoom"("id", "communityId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopSessionPlayer" ADD CONSTRAINT "StopSessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopCategory" ADD CONSTRAINT "StopCategory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopRound" ADD CONSTRAINT "StopRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StopSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopAnswer" ADD CONSTRAINT "StopAnswer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "StopRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopAnswer" ADD CONSTRAINT "StopAnswer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StopCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StopInvalidVote" ADD CONSTRAINT "StopInvalidVote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "StopAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
