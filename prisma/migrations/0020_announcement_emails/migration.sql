CREATE TYPE "SocialContentFormat" AS ENUM ('PLAIN_TEXT', 'MARKDOWN');

ALTER TABLE "CommunityEmailSettings"
ADD COLUMN "inviteEmailsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "announcementEmailsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SocialPost"
ADD COLUMN "contentFormat" "SocialContentFormat" NOT NULL DEFAULT 'PLAIN_TEXT';

ALTER TABLE "EmailDelivery"
ADD COLUMN "socialPostId" UUID;

CREATE INDEX "EmailDelivery_socialPostId_idx" ON "EmailDelivery"("socialPostId");

ALTER TABLE "EmailDelivery"
ADD CONSTRAINT "EmailDelivery_socialPostId_fkey"
FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
