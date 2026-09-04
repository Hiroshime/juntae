CREATE TYPE "CostShareStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "CommunityHoliday" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "date" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommunityHoliday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostShare" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "eventId" UUID,
  "createdById" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "status" "CostShareStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "CostShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostShareParticipant" (
  "costShareId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CostShareParticipant_pkey" PRIMARY KEY ("costShareId", "userId")
);

CREATE TABLE "CostShareExpense" (
  "id" UUID NOT NULL,
  "costShareId" UUID NOT NULL,
  "payerId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "purchasedAt" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "CostShareExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityHoliday_communityId_date_name_key"
ON "CommunityHoliday"("communityId", "date", "name");
CREATE INDEX "CommunityHoliday_communityId_date_idx"
ON "CommunityHoliday"("communityId", "date");
CREATE INDEX "CostShare_communityId_createdAt_idx"
ON "CostShare"("communityId", "createdAt");
CREATE INDEX "CostShare_eventId_idx" ON "CostShare"("eventId");
CREATE INDEX "CostShare_createdById_idx" ON "CostShare"("createdById");
CREATE INDEX "CostShareParticipant_userId_idx" ON "CostShareParticipant"("userId");
CREATE INDEX "CostShareExpense_costShareId_purchasedAt_idx"
ON "CostShareExpense"("costShareId", "purchasedAt");
CREATE INDEX "CostShareExpense_payerId_idx" ON "CostShareExpense"("payerId");
CREATE INDEX "CostShareExpense_createdById_idx" ON "CostShareExpense"("createdById");

ALTER TABLE "CommunityHoliday"
ADD CONSTRAINT "CommunityHoliday_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityHoliday"
ADD CONSTRAINT "CommunityHoliday_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostShare"
ADD CONSTRAINT "CostShare_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostShare"
ADD CONSTRAINT "CostShare_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostShare"
ADD CONSTRAINT "CostShare_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostShareParticipant"
ADD CONSTRAINT "CostShareParticipant_costShareId_fkey"
FOREIGN KEY ("costShareId") REFERENCES "CostShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostShareParticipant"
ADD CONSTRAINT "CostShareParticipant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostShareExpense"
ADD CONSTRAINT "CostShareExpense_costShareId_fkey"
FOREIGN KEY ("costShareId") REFERENCES "CostShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostShareExpense"
ADD CONSTRAINT "CostShareExpense_payerId_fkey"
FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CostShareExpense"
ADD CONSTRAINT "CostShareExpense_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CostShareExpense"
ADD CONSTRAINT "CostShareExpense_amount_check" CHECK ("amount" > 0);
