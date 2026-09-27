CREATE TABLE "ArenaShelterItem" (
    "id" UUID NOT NULL,
    "shelterId" UUID NOT NULL,
    "catalogItemKey" VARCHAR(80) NOT NULL,
    "acquiredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArenaShelterItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ArenaShelterItem"
ADD CONSTRAINT "ArenaShelterItem_shelterId_fkey"
FOREIGN KEY ("shelterId") REFERENCES "ArenaShelter"("gladiatorId")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ArenaShelterItem_shelterId_catalogItemKey_key"
ON "ArenaShelterItem"("shelterId", "catalogItemKey");

CREATE INDEX "ArenaShelterItem_shelterId_acquiredAt_id_idx"
ON "ArenaShelterItem"("shelterId", "acquiredAt", "id");

CREATE INDEX "ArenaShelterItem_catalogItemKey_idx"
ON "ArenaShelterItem"("catalogItemKey");
