ALTER TABLE "Event" ADD COLUMN "paymentTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accountClosedAt" TIMESTAMPTZ(6), ADD COLUMN "accountSnapshot" JSONB;
ALTER TABLE "Event" ADD CONSTRAINT "Event_account_snapshot_check"
  CHECK (("accountClosedAt" IS NULL AND "accountSnapshot" IS NULL) OR
    ("accountClosedAt" IS NOT NULL AND "accountSnapshot" IS NOT NULL AND "paymentTrackingEnabled"));

CREATE TABLE "EventPayment" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "recordedById" UUID NOT NULL,
  "amountCents" BIGINT NOT NULL,
  "direction" VARCHAR(8) NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMPTZ(6),
  "voidedById" UUID,
  CONSTRAINT "EventPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventPayment_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 9007199254740991),
  CONSTRAINT "EventPayment_direction_check" CHECK ("direction" IN ('RECEIVED', 'REFUNDED')),
  CONSTRAINT "EventPayment_void_check" CHECK (("voidedAt" IS NULL) = ("voidedById" IS NULL)),
  CONSTRAINT "EventPayment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EventPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EventPayment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EventPayment_eventId_createdAt_idx" ON "EventPayment"("eventId", "createdAt");
CREATE INDEX "EventPayment_userId_idx" ON "EventPayment"("userId");
CREATE INDEX "EventPayment_recordedById_idx" ON "EventPayment"("recordedById");
CREATE INDEX "EventPayment_voidedById_idx" ON "EventPayment"("voidedById");
