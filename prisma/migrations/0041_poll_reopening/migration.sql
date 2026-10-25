ALTER TABLE "Poll"
  ADD COLUMN "closedAt" TIMESTAMPTZ(6);

UPDATE "Poll"
SET "closedAt" = "updatedAt"
WHERE "status" = 'CLOSED';

ALTER TABLE "Poll"
  ADD CONSTRAINT "Poll_closed_after_creation_check"
  CHECK ("closedAt" IS NULL OR "closedAt" >= "createdAt");
