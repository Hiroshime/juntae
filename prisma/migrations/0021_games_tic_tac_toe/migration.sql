CREATE TYPE "GameType" AS ENUM ('TIC_TAC_TOE');
CREATE TYPE "GameRoomStatus" AS ENUM ('WAITING', 'PLAYING', 'CLOSED');
CREATE TYPE "GameMatchStatus" AS ENUM ('ACTIVE', 'FINISHED');
CREATE TYPE "GameMatchOutcome" AS ENUM ('X_WON', 'O_WON', 'DRAW', 'X_WON_FORFEIT', 'O_WON_FORFEIT');

CREATE TABLE "GameRoom" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "GameRoomStatus" NOT NULL DEFAULT 'WAITING',
    "rules" JSONB NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "GameRoom_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameRoom_roundNumber_check" CHECK ("roundNumber" >= 0),
    CONSTRAINT "GameRoom_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "GameRoomPlayer" (
    "roomId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "GameRoomPlayer_pkey" PRIMARY KEY ("roomId", "userId"),
    CONSTRAINT "GameRoomPlayer_seat_check" CHECK ("seat" BETWEEN 1 AND 2)
);

CREATE TABLE "GameMatch" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "gameType" "GameType" NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "GameMatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "outcome" "GameMatchOutcome",
    "board" VARCHAR(9) NOT NULL DEFAULT '---------',
    "playerXId" UUID NOT NULL,
    "playerXName" VARCHAR(80) NOT NULL,
    "playerOId" UUID NOT NULL,
    "playerOName" VARCHAR(80) NOT NULL,
    "nextTurnUserId" UUID,
    "winnerId" UUID,
    "winnerName" VARCHAR(80),
    "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),
    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GameMatch_roundNumber_check" CHECK ("roundNumber" > 0),
    CONSTRAINT "GameMatch_players_check" CHECK ("playerXId" <> "playerOId"),
    CONSTRAINT "GameMatch_board_check" CHECK ("board" ~ '^[XO-]{9}$'),
    CONSTRAINT "GameMatch_state_check" CHECK (
      ("status" = 'ACTIVE' AND "outcome" IS NULL AND "finishedAt" IS NULL AND "nextTurnUserId" IS NOT NULL AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR
      ("status" = 'FINISHED' AND "outcome" IS NOT NULL AND "finishedAt" IS NOT NULL AND "nextTurnUserId" IS NULL)
    ),
    CONSTRAINT "GameMatch_winner_check" CHECK (
      ("outcome" IS NULL AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR ("outcome" = 'DRAW' AND "winnerId" IS NULL AND "winnerName" IS NULL)
      OR ("outcome" IN ('X_WON', 'X_WON_FORFEIT') AND "winnerId" = "playerXId" AND "winnerName" = "playerXName")
      OR ("outcome" IN ('O_WON', 'O_WON_FORFEIT') AND "winnerId" = "playerOId" AND "winnerName" = "playerOName")
    )
);

CREATE UNIQUE INDEX "GameRoom_id_communityId_key" ON "GameRoom"("id", "communityId");
CREATE INDEX "GameRoom_communityId_status_updatedAt_id_idx" ON "GameRoom"("communityId", "status", "updatedAt", "id");
CREATE INDEX "GameRoom_createdById_idx" ON "GameRoom"("createdById");
CREATE UNIQUE INDEX "GameRoomPlayer_roomId_seat_key" ON "GameRoomPlayer"("roomId", "seat");
CREATE INDEX "GameRoomPlayer_communityId_userId_idx" ON "GameRoomPlayer"("communityId", "userId");
CREATE UNIQUE INDEX "GameMatch_roomId_roundNumber_key" ON "GameMatch"("roomId", "roundNumber");
CREATE UNIQUE INDEX "GameMatch_one_active_per_room_key" ON "GameMatch"("roomId") WHERE "status" = 'ACTIVE';
CREATE INDEX "GameMatch_communityId_gameType_finishedAt_id_idx" ON "GameMatch"("communityId", "gameType", "finishedAt", "id");
CREATE INDEX "GameMatch_roomId_status_startedAt_idx" ON "GameMatch"("roomId", "status", "startedAt");
CREATE INDEX "GameMatch_winnerId_finishedAt_idx" ON "GameMatch"("winnerId", "finishedAt");

ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRoom" ADD CONSTRAINT "GameRoom_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRoomPlayer" ADD CONSTRAINT "GameRoomPlayer_roomId_communityId_fkey" FOREIGN KEY ("roomId", "communityId") REFERENCES "GameRoom"("id", "communityId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRoomPlayer" ADD CONSTRAINT "GameRoomPlayer_communityId_userId_fkey" FOREIGN KEY ("communityId", "userId") REFERENCES "CommunityMember"("communityId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_roomId_communityId_fkey" FOREIGN KEY ("roomId", "communityId") REFERENCES "GameRoom"("id", "communityId") ON DELETE CASCADE ON UPDATE CASCADE;
