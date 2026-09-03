import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin } from "@/lib/http/route";

describe.sequential("security controls", () => {
  const rawRateLimitKey = `security-test:${randomUUID()}`;
  const storedRateLimitKey = createHash("sha256").update(rawRateLimitKey).digest("hex");

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { key: storedRateLimitKey } });
  });

  it("rejeita mutação enviada por outra origem", () => {
    const request = new Request("https://galera.local/api/users/me", {
      headers: { host: "galera.local", origin: "https://malicioso.local" },
    });
    expect(() => assertSameOrigin(request)).toThrowError(
      expect.objectContaining({ code: "INVALID_ORIGIN", status: 403 }),
    );
  });

  it("compartilha o limite de tentativas pelo PostgreSQL", async () => {
    await enforceRateLimit(rawRateLimitKey, 2, 60_000);
    await enforceRateLimit(rawRateLimitKey, 2, 60_000);
    await expect(enforceRateLimit(rawRateLimitKey, 2, 60_000)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });
});
