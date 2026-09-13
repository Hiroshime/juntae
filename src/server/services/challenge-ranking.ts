import { Prisma } from "@prisma/client";

// The live board and immutable final snapshot use exactly the same calculation.
export function challengeRankingQuery(communityId: string, challengeId: string) {
  return Prisma.sql`
    WITH totals AS (
      SELECT p."userId", COALESCE(NULLIF(m."displayName", ''), u."name") AS name,
        COALESCE(SUM(a.score), 0)::numeric(18,1) AS score, COUNT(a.id)::int AS "activityCount"
      FROM "ChallengeParticipant" p
      JOIN "CommunityMember" m ON m."communityId" = p."communityId" AND m."userId" = p."userId"
      JOIN "User" u ON u.id = p."userId"
      LEFT JOIN "ChallengeActivity" a ON a."challengeId" = p."challengeId" AND a."userId" = p."userId"
        AND a."deletedAt" IS NULL AND a."invalidatedAt" IS NULL
      WHERE p."challengeId" = ${challengeId}::uuid AND p."communityId" = ${communityId}::uuid AND p."leftAt" IS NULL
      GROUP BY p."userId", m."displayName", u.name
    ) SELECT *, CASE WHEN score > 0 THEN (RANK() OVER (ORDER BY score DESC))::int ELSE NULL END AS position
      FROM totals
  `;
}
