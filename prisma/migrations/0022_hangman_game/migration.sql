ALTER TYPE "GameType" ADD VALUE 'HANGMAN';

CREATE TYPE "HangmanSessionStatus" AS ENUM ('ACTIVE', 'FINISHED', 'CANCELLED');
CREATE TYPE "HangmanRoundStatus" AS ENUM ('SETTING_WORD', 'GUESSING', 'FINISHED');
CREATE TYPE "HangmanRoundOutcome" AS ENUM ('GUESSED', 'HANGED', 'CANCELLED');
CREATE TYPE "HangmanGuessType" AS ENUM ('LETTER', 'WORD');

ALTER TABLE "GameRoomPlayer" DROP CONSTRAINT "GameRoomPlayer_seat_check";
ALTER TABLE "GameRoomPlayer"
  ADD CONSTRAINT "GameRoomPlayer_seat_check" CHECK ("seat" BETWEEN 1 AND 5);

CREATE TABLE "HangmanSession" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "status" "HangmanSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalRounds" INTEGER NOT NULL,
    "currentRoundNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancellationReason" VARCHAR(160),
    CONSTRAINT "HangmanSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HangmanSession_totalRounds_check" CHECK ("totalRounds" BETWEEN 1 AND 20),
    CONSTRAINT "HangmanSession_currentRoundNumber_check" CHECK ("currentRoundNumber" BETWEEN 1 AND "totalRounds"),
    CONSTRAINT "HangmanSession_state_check" CHECK (
      ("status" = 'ACTIVE' AND "finishedAt" IS NULL AND "cancelledAt" IS NULL)
      OR ("status" = 'FINISHED' AND "finishedAt" IS NOT NULL AND "cancelledAt" IS NULL)
      OR ("status" = 'CANCELLED' AND "finishedAt" IS NULL AND "cancelledAt" IS NOT NULL)
    )
);

CREATE TABLE "HangmanSessionPlayer" (
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "turnOrder" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HangmanSessionPlayer_pkey" PRIMARY KEY ("sessionId", "userId"),
    CONSTRAINT "HangmanSessionPlayer_turnOrder_check" CHECK ("turnOrder" BETWEEN 1 AND 5),
    CONSTRAINT "HangmanSessionPlayer_score_check" CHECK ("score" >= 0)
);

CREATE TABLE "HangmanRound" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "setterId" UUID NOT NULL,
    "setterName" VARCHAR(80) NOT NULL,
    "status" "HangmanRoundStatus" NOT NULL DEFAULT 'SETTING_WORD',
    "outcome" "HangmanRoundOutcome",
    "secretWord" VARCHAR(80),
    "normalizedWord" VARCHAR(80),
    "clue" VARCHAR(160),
    "guessedLetters" VARCHAR(32) NOT NULL DEFAULT '',
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "currentTurnUserId" UUID,
    "winnerId" UUID,
    "winnerName" VARCHAR(80),
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wordSetAt" TIMESTAMPTZ(6),
    "finishedAt" TIMESTAMPTZ(6),
    CONSTRAINT "HangmanRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HangmanRound_roundNumber_check" CHECK ("roundNumber" > 0),
    CONSTRAINT "HangmanRound_wrongCount_check" CHECK ("wrongCount" BETWEEN 0 AND 10),
    CONSTRAINT "HangmanRound_state_check" CHECK (
      ("status" = 'SETTING_WORD' AND "outcome" IS NULL AND "secretWord" IS NULL AND "normalizedWord" IS NULL AND "wordSetAt" IS NULL AND "finishedAt" IS NULL AND "currentTurnUserId" IS NULL AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR ("status" = 'GUESSING' AND "outcome" IS NULL AND "secretWord" IS NOT NULL AND "normalizedWord" IS NOT NULL AND "wordSetAt" IS NOT NULL AND "finishedAt" IS NULL AND "currentTurnUserId" IS NOT NULL AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR ("status" = 'FINISHED' AND "outcome" IS NOT NULL AND "finishedAt" IS NOT NULL AND "currentTurnUserId" IS NULL)
    ),
    CONSTRAINT "HangmanRound_winner_check" CHECK (
      ("outcome" IS NULL AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR ("outcome" = 'GUESSED' AND "winnerId" IS NOT NULL AND "winnerName" IS NOT NULL)
      OR ("outcome" IN ('HANGED', 'CANCELLED') AND "winnerId" IS NULL AND "winnerName" IS NULL)
    )
);

CREATE TABLE "HangmanGuess" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "userName" VARCHAR(80) NOT NULL,
    "type" "HangmanGuessType" NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "normalizedValue" VARCHAR(80) NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HangmanGuess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HangmanGuess_turnNumber_check" CHECK ("turnNumber" > 0)
);

CREATE UNIQUE INDEX "HangmanSession_id_communityId_key" ON "HangmanSession"("id", "communityId");
CREATE UNIQUE INDEX "HangmanSession_one_active_per_room_key" ON "HangmanSession"("roomId") WHERE "status" = 'ACTIVE';
CREATE INDEX "HangmanSession_communityId_status_finishedAt_id_idx" ON "HangmanSession"("communityId", "status", "finishedAt", "id");
CREATE INDEX "HangmanSession_roomId_status_startedAt_idx" ON "HangmanSession"("roomId", "status", "startedAt");
CREATE UNIQUE INDEX "HangmanSessionPlayer_sessionId_turnOrder_key" ON "HangmanSessionPlayer"("sessionId", "turnOrder");
CREATE INDEX "HangmanSessionPlayer_userId_idx" ON "HangmanSessionPlayer"("userId");
CREATE UNIQUE INDEX "HangmanRound_sessionId_roundNumber_key" ON "HangmanRound"("sessionId", "roundNumber");
CREATE INDEX "HangmanRound_sessionId_status_roundNumber_idx" ON "HangmanRound"("sessionId", "status", "roundNumber");
CREATE INDEX "HangmanRound_winnerId_finishedAt_idx" ON "HangmanRound"("winnerId", "finishedAt");
CREATE UNIQUE INDEX "HangmanGuess_roundId_turnNumber_key" ON "HangmanGuess"("roundId", "turnNumber");
CREATE INDEX "HangmanGuess_roundId_createdAt_id_idx" ON "HangmanGuess"("roundId", "createdAt", "id");
CREATE INDEX "HangmanGuess_userId_idx" ON "HangmanGuess"("userId");

ALTER TABLE "HangmanSession" ADD CONSTRAINT "HangmanSession_roomId_communityId_fkey" FOREIGN KEY ("roomId", "communityId") REFERENCES "GameRoom"("id", "communityId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HangmanSessionPlayer" ADD CONSTRAINT "HangmanSessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HangmanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HangmanRound" ADD CONSTRAINT "HangmanRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HangmanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HangmanGuess" ADD CONSTRAINT "HangmanGuess_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "HangmanRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
