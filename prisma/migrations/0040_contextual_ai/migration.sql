CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "CommunityAiSettings" (
    "communityId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "model" VARCHAR(120) NOT NULL DEFAULT 'qwen3:1.7b',
    "assistantName" VARCHAR(60) NOT NULL DEFAULT 'Juntaê IA',
    "customInstructions" VARCHAR(1000),
    "includeEvents" BOOLEAN NOT NULL DEFAULT true,
    "includeAvailability" BOOLEAN NOT NULL DEFAULT true,
    "includePolls" BOOLEAN NOT NULL DEFAULT true,
    "includeAnnouncements" BOOLEAN NOT NULL DEFAULT true,
    "includeChallenges" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityAiSettings_pkey" PRIMARY KEY ("communityId")
);

CREATE TABLE "AiConversation" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" VARCHAR(120),
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityAiSettings_updatedById_idx" ON "CommunityAiSettings"("updatedById");
CREATE INDEX "AiConversation_communityId_userId_updatedAt_idx"
    ON "AiConversation"("communityId", "userId", "updatedAt");
CREATE INDEX "AiMessage_conversationId_createdAt_id_idx"
    ON "AiMessage"("conversationId", "createdAt", "id");
CREATE UNIQUE INDEX "AiMessage_conversationId_sequence_key"
    ON "AiMessage"("conversationId", "sequence");

ALTER TABLE "CommunityAiSettings"
    ADD CONSTRAINT "CommunityAiSettings_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityAiSettings"
    ADD CONSTRAINT "CommunityAiSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiConversation"
    ADD CONSTRAINT "AiConversation_communityId_fkey"
    FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiConversation"
    ADD CONSTRAINT "AiConversation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMessage"
    ADD CONSTRAINT "AiMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
