CREATE TABLE "ArenaGladiator" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "pronouns" VARCHAR(16) NOT NULL,
    "origin" VARCHAR(32) NOT NULL,
    "entryLine" VARCHAR(120),
    "victoryLine" VARCHAR(120),
    "appearance" JSONB NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "gold" INTEGER NOT NULL DEFAULT 500,
    "fame" INTEGER NOT NULL DEFAULT 0,
    "unspentSkillPoints" INTEGER NOT NULL DEFAULT 0,
    "strength" INTEGER NOT NULL,
    "agility" INTEGER NOT NULL,
    "technique" INTEGER NOT NULL,
    "defence" INTEGER NOT NULL,
    "vitality" INTEGER NOT NULL,
    "presence" INTEGER NOT NULL,
    "stamina" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ArenaGladiator_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaGladiator_progress_check" CHECK (
        "level" >= 1 AND "experience" >= 0 AND "gold" >= 0 AND "fame" >= 0
        AND "unspentSkillPoints" >= 0 AND "wins" >= 0 AND "losses" >= 0
    ),
    CONSTRAINT "ArenaGladiator_attributes_check" CHECK (
        "strength" >= 1 AND "agility" >= 1 AND "technique" >= 1
        AND "defence" >= 1 AND "vitality" >= 1 AND "presence" >= 1 AND "stamina" >= 1
    )
);

CREATE TABLE "ArenaInventoryItem" (
    "id" UUID NOT NULL,
    "gladiatorId" UUID NOT NULL,
    "catalogItemKey" VARCHAR(80) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equippedSlot" VARCHAR(32),
    "metadata" JSONB,
    "acquiredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaInventoryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArenaInventoryItem_quantity_check" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "ArenaGladiator_communityId_userId_key"
ON "ArenaGladiator"("communityId", "userId");
CREATE INDEX "ArenaGladiator_communityId_fame_level_id_idx"
ON "ArenaGladiator"("communityId", "fame", "level", "id");
CREATE INDEX "ArenaGladiator_userId_idx" ON "ArenaGladiator"("userId");
CREATE INDEX "ArenaInventoryItem_gladiatorId_acquiredAt_id_idx"
ON "ArenaInventoryItem"("gladiatorId", "acquiredAt", "id");
CREATE INDEX "ArenaInventoryItem_catalogItemKey_idx" ON "ArenaInventoryItem"("catalogItemKey");

ALTER TABLE "ArenaGladiator" ADD CONSTRAINT "ArenaGladiator_communityId_userId_fkey"
FOREIGN KEY ("communityId", "userId") REFERENCES "CommunityMember"("communityId", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArenaInventoryItem" ADD CONSTRAINT "ArenaInventoryItem_gladiatorId_fkey"
FOREIGN KEY ("gladiatorId") REFERENCES "ArenaGladiator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
