-- CreateEnum
CREATE TYPE "PollQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- AlterEnum
ALTER TYPE "PollType" ADD VALUE 'GROUPED';

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "allowMemberOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo';

-- AlterTable
ALTER TABLE "PollOption" ADD COLUMN     "questionId" UUID;

-- CreateTable
CREATE TABLE "PollQuestion" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "type" "PollQuestionType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PollQuestion_pollId_sortOrder_idx" ON "PollQuestion"("pollId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PollQuestion_id_pollId_key" ON "PollQuestion"("id", "pollId");

-- CreateIndex
CREATE INDEX "PollOption_questionId_pollId_idx" ON "PollOption"("questionId", "pollId");

-- AddForeignKey
ALTER TABLE "PollQuestion" ADD CONSTRAINT "PollQuestion_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_questionId_pollId_fkey" FOREIGN KEY ("questionId", "pollId") REFERENCES "PollQuestion"("id", "pollId") ON DELETE CASCADE ON UPDATE CASCADE;

