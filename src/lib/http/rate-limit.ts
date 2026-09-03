import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/server/errors";

type UpdatedBucket = { count: number; resetsAt: Date };

let requestsSinceCleanup = 0;

export function clientIdentifier(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const bucketKey = createHash("sha256").update(key).digest("hex");
  const resetsAt = new Date(Date.now() + windowMs);
  const [bucket] = await prisma.$queryRaw<UpdatedBucket[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetsAt", "updatedAt")
    VALUES (${bucketKey}, 1, ${resetsAt}, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetsAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetsAt" = CASE
        WHEN "RateLimitBucket"."resetsAt" <= CURRENT_TIMESTAMP THEN EXCLUDED."resetsAt"
        ELSE "RateLimitBucket"."resetsAt"
      END,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count", "resetsAt"
  `;

  requestsSinceCleanup += 1;
  if (requestsSinceCleanup >= 100) {
    requestsSinceCleanup = 0;
    await prisma.rateLimitBucket.deleteMany({
      where: { resetsAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1_000) } },
    });
  }

  if (bucket && bucket.count > limit) {
    throw new AppError(
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      429,
      "RATE_LIMITED",
    );
  }
}
