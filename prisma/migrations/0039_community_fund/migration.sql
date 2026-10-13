CREATE TYPE "CommunityFundEntryType" AS ENUM ('DEPOSIT', 'USAGE');
CREATE TYPE "CommunityFundEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'VOIDED');

CREATE TABLE "CommunityFundSettings" (
    "communityId" UUID NOT NULL,
    "monthlyContributionCents" BIGINT,
    "pixKey" VARCHAR(320),
    "pixRecipientName" VARCHAR(120),
    "pixCopyPaste" TEXT,
    "qrCodeContentType" VARCHAR(80),
    "qrCodeData" BYTEA,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "CommunityFundSettings_pkey" PRIMARY KEY ("communityId"),
    CONSTRAINT "CommunityFundSettings_monthly_contribution_check"
      CHECK ("monthlyContributionCents" IS NULL OR "monthlyContributionCents" > 0),
    CONSTRAINT "CommunityFundSettings_qr_pair_check"
      CHECK (("qrCodeContentType" IS NULL) = ("qrCodeData" IS NULL))
);

CREATE TABLE "CommunityFundEntry" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "reviewedById" UUID,
    "eventId" UUID,
    "type" "CommunityFundEntryType" NOT NULL,
    "status" "CommunityFundEntryStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" BIGINT NOT NULL,
    "referenceMonth" DATE,
    "effectiveDate" DATE NOT NULL,
    "note" VARCHAR(500),
    "reviewNote" VARCHAR(500),
    "reviewedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "CommunityFundEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommunityFundEntry_amount_check" CHECK ("amountCents" > 0),
    CONSTRAINT "CommunityFundEntry_reference_month_check"
      CHECK (("type" = 'DEPOSIT' AND "referenceMonth" IS NOT NULL) OR
             ("type" = 'USAGE' AND "referenceMonth" IS NULL))
);

CREATE INDEX "CommunityFundSettings_updatedById_idx" ON "CommunityFundSettings"("updatedById");
CREATE INDEX "CommunityFundEntry_communityId_status_createdAt_id_idx"
  ON "CommunityFundEntry"("communityId", "status", "createdAt", "id");
CREATE INDEX "CommunityFundEntry_communityId_userId_createdAt_id_idx"
  ON "CommunityFundEntry"("communityId", "userId", "createdAt", "id");
CREATE INDEX "CommunityFundEntry_eventId_idx" ON "CommunityFundEntry"("eventId");
CREATE INDEX "CommunityFundEntry_submittedById_idx" ON "CommunityFundEntry"("submittedById");
CREATE INDEX "CommunityFundEntry_reviewedById_idx" ON "CommunityFundEntry"("reviewedById");

ALTER TABLE "CommunityFundSettings" ADD CONSTRAINT "CommunityFundSettings_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityFundSettings" ADD CONSTRAINT "CommunityFundSettings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunityFundEntry" ADD CONSTRAINT "CommunityFundEntry_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityFundEntry" ADD CONSTRAINT "CommunityFundEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityFundEntry" ADD CONSTRAINT "CommunityFundEntry_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityFundEntry" ADD CONSTRAINT "CommunityFundEntry_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunityFundEntry" ADD CONSTRAINT "CommunityFundEntry_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
