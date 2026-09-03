CREATE TYPE "CommunityRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "ScheduleRuleType" AS ENUM ('WEEKLY', 'CYCLE');
CREATE TYPE "ScheduleRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'PARTIALLY_AVAILABLE', 'WORKING', 'DAY_OFF', 'VACATION', 'UNAVAILABLE', 'UNKNOWN');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'MAYBE', 'NOT_GOING');
CREATE TYPE "PollType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DATE_OPTIONS');
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "avatarUrl" TEXT,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Community" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "description" TEXT,
  "avatarUrl" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
CREATE INDEX "Community_createdById_idx" ON "Community"("createdById");

CREATE TABLE "CommunityMember" (
  "communityId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("communityId", "userId")
);
CREATE INDEX "CommunityMember_userId_idx" ON "CommunityMember"("userId");

CREATE TABLE "Invite" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "tokenHash" VARCHAR(128) NOT NULL,
  "createdById" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(6),
  "maxUses" INTEGER,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "revokedAt" TIMESTAMPTZ(6),
  "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_communityId_idx" ON "Invite"("communityId");

CREATE TABLE "ScheduleRule" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "ruleType" "ScheduleRuleType" NOT NULL,
  "anchorDate" DATE,
  "workDays" INTEGER,
  "restDays" INTEGER,
  "weeklyPattern" JSONB,
  "startDate" DATE NOT NULL,
  "endDate" DATE,
  "status" "ScheduleRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ScheduleRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduleRule_communityId_startDate_idx" ON "ScheduleRule"("communityId", "startDate");
CREATE INDEX "ScheduleRule_userId_startDate_idx" ON "ScheduleRule"("userId", "startDate");

CREATE TABLE "AvailabilityOverride" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "startAt" TIMESTAMPTZ(6) NOT NULL,
  "endAt" TIMESTAMPTZ(6) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "status" "AvailabilityStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AvailabilityOverride_communityId_startAt_idx" ON "AvailabilityOverride"("communityId", "startAt");
CREATE INDEX "AvailabilityOverride_userId_startAt_idx" ON "AvailabilityOverride"("userId", "startAt");

CREATE TABLE "Event" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  "locationName" VARCHAR(160),
  "locationAddress" TEXT,
  "locationUrl" TEXT,
  "estimatedCost" DECIMAL(10,2),
  "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "participantLimit" INTEGER,
  "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Event_communityId_startsAt_idx" ON "Event"("communityId", "startsAt");

CREATE TABLE "EventRsvp" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "RsvpStatus" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "EventRsvp_userId_idx" ON "EventRsvp"("userId");

CREATE TABLE "Poll" (
  "id" UUID NOT NULL,
  "communityId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "type" "PollType" NOT NULL,
  "allowVoteChange" BOOLEAN NOT NULL DEFAULT true,
  "closesAt" TIMESTAMPTZ(6),
  "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Poll_communityId_status_idx" ON "Poll"("communityId", "status");

CREATE TABLE "PollOption" (
  "id" UUID NOT NULL,
  "pollId" UUID NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "dateValue" DATE,
  "metadata" JSONB,
  CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PollOption_pollId_sortOrder_idx" ON "PollOption"("pollId", "sortOrder");

CREATE TABLE "PollVote" (
  "id" UUID NOT NULL,
  "pollId" UUID NOT NULL,
  "optionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PollVote_optionId_userId_key" ON "PollVote"("optionId", "userId");
CREATE INDEX "PollVote_pollId_userId_idx" ON "PollVote"("pollId", "userId");

ALTER TABLE "Community" ADD CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleRule" ADD CONSTRAINT "ScheduleRule_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleRule" ADD CONSTRAINT "ScheduleRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilityOverride" ADD CONSTRAINT "AvailabilityOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
