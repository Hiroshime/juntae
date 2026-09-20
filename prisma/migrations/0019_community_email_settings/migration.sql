CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'CUSTOM_SMTP');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "CommunityEmailSettings" (
    "communityId" UUID NOT NULL,
    "provider" "EmailProvider" NOT NULL DEFAULT 'GMAIL',
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL,
    "username" VARCHAR(320) NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "fromName" VARCHAR(120) NOT NULL,
    "fromEmail" VARCHAR(320) NOT NULL,
    "replyTo" VARCHAR(320),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMPTZ(6),
    "lastTestSucceeded" BOOLEAN,
    "lastTestErrorCode" VARCHAR(80),
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "CommunityEmailSettings_pkey" PRIMARY KEY ("communityId")
);

CREATE TABLE "EmailDelivery" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "requestedById" UUID,
    "kind" VARCHAR(40) NOT NULL,
    "recipientEmail" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(6),
    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityEmailSettings_updatedById_idx" ON "CommunityEmailSettings"("updatedById");
CREATE INDEX "EmailDelivery_communityId_createdAt_id_idx" ON "EmailDelivery"("communityId", "createdAt", "id");
CREATE INDEX "EmailDelivery_requestedById_idx" ON "EmailDelivery"("requestedById");

ALTER TABLE "CommunityEmailSettings" ADD CONSTRAINT "CommunityEmailSettings_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityEmailSettings" ADD CONSTRAINT "CommunityEmailSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
