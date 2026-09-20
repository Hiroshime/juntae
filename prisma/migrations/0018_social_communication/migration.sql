CREATE TYPE "SocialPostKind" AS ENUM ('POST', 'ANNOUNCEMENT');
CREATE TYPE "SocialMediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "SocialReactionType" AS ENUM ('LIKE', 'LOVE', 'CELEBRATE', 'LAUGH', 'SUPPORT');

CREATE TABLE "SocialPost" (
    "id" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" "SocialPostKind" NOT NULL DEFAULT 'POST',
    "content" VARCHAR(5000),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialMedia" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "kind" "SocialMediaKind" NOT NULL,
    "contentType" VARCHAR(80) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialReaction" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "SocialReactionType" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialReaction_pkey" PRIMARY KEY ("postId", "userId")
);

CREATE INDEX "SocialPost_communityId_createdAt_id_idx" ON "SocialPost"("communityId", "createdAt", "id");
CREATE INDEX "SocialPost_authorId_idx" ON "SocialPost"("authorId");
CREATE INDEX "SocialMedia_postId_sortOrder_idx" ON "SocialMedia"("postId", "sortOrder");
CREATE INDEX "SocialComment_postId_createdAt_id_idx" ON "SocialComment"("postId", "createdAt", "id");
CREATE INDEX "SocialComment_authorId_idx" ON "SocialComment"("authorId");
CREATE INDEX "SocialReaction_userId_idx" ON "SocialReaction"("userId");

ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialMedia" ADD CONSTRAINT "SocialMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialReaction" ADD CONSTRAINT "SocialReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialReaction" ADD CONSTRAINT "SocialReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
