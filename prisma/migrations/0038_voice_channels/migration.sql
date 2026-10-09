CREATE TABLE "VoiceChannel" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "nameKey" VARCHAR(60) NOT NULL,
    "description" VARCHAR(160),
    "maxParticipants" INTEGER NOT NULL DEFAULT 12,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "VoiceChannel_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VoiceChannel_max_participants_check" CHECK (
        "maxParticipants" >= 2 AND "maxParticipants" <= 50
    ),
    CONSTRAINT "VoiceChannel_sort_order_check" CHECK ("sortOrder" >= 0)
);

CREATE UNIQUE INDEX "VoiceChannel_communityId_nameKey_key"
ON "VoiceChannel"("communityId", "nameKey");

CREATE INDEX "VoiceChannel_communityId_sortOrder_createdAt_id_idx"
ON "VoiceChannel"("communityId", "sortOrder", "createdAt", "id");

CREATE INDEX "VoiceChannel_createdById_idx" ON "VoiceChannel"("createdById");

ALTER TABLE "VoiceChannel"
ADD CONSTRAINT "VoiceChannel_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceChannel"
ADD CONSTRAINT "VoiceChannel_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "VoiceChannel" (
    "id", "communityId", "createdById", "name", "nameKey", "description",
    "maxParticipants", "sortOrder", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(), "id", "createdById", 'Geral', 'geral',
    'Sala principal da comunidade.', 12, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Community";
