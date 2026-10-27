CREATE TYPE "EventBillingMode" AS ENUM ('EQUAL', 'DAY', 'NIGHT');
CREATE TYPE "CostShareAllocation" AS ENUM ('SELECTED', 'EVENT', 'DAY');

ALTER TABLE "Event"
  ADD COLUMN "billingMode" "EventBillingMode" NOT NULL DEFAULT 'EQUAL',
  ADD COLUMN "billingParticipants" JSONB;

ALTER TABLE "CostShare"
  ADD COLUMN "allocationType" "CostShareAllocation" NOT NULL DEFAULT 'SELECTED',
  ADD COLUMN "allocationDate" DATE,
  ADD COLUMN "calculationSnapshot" JSONB;

ALTER TABLE "CostShare" ADD CONSTRAINT "CostShare_allocation_date_check"
  CHECK (("allocationType" = 'DAY' AND "allocationDate" IS NOT NULL)
    OR ("allocationType" <> 'DAY' AND "allocationDate" IS NULL));
