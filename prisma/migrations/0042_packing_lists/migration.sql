-- CreateTable
CREATE TABLE "PackingList" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "eventId" UUID,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingItem" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "quantity" VARCHAR(100),
    "note" VARCHAR(500),
    "responsibleUserId" UUID,
    "responsibleLabel" VARCHAR(160),
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PackingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingList_communityId_createdAt_id_idx" ON "PackingList"("communityId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PackingList_eventId_idx" ON "PackingList"("eventId");

-- CreateIndex
CREATE INDEX "PackingList_createdById_idx" ON "PackingList"("createdById");

-- CreateIndex
CREATE INDEX "PackingItem_listId_createdAt_id_idx" ON "PackingItem"("listId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "PackingItem_createdById_idx" ON "PackingItem"("createdById");

-- CreateIndex
CREATE INDEX "PackingItem_responsibleUserId_idx" ON "PackingItem"("responsibleUserId");

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

