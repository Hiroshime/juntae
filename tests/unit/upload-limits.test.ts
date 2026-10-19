import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { MAX_ACTIVITY_REQUEST_BYTES } from "@/lib/challenge-activities";
import { MAX_POLL_MULTIPART_BYTES } from "@/lib/polls/images";
import { MAX_SOCIAL_REQUEST_BYTES } from "@/lib/social";

describe("limites globais de upload", () => {
  it("mantém o middleware acima de todos os corpos multipart aceitos pelas rotas", () => {
    const middlewareLimit = nextConfig.experimental?.middlewareClientMaxBodySize;
    expect(typeof middlewareLimit).toBe("number");
    expect(middlewareLimit).toBeGreaterThanOrEqual(
      Math.max(MAX_POLL_MULTIPART_BYTES, MAX_SOCIAL_REQUEST_BYTES, MAX_ACTIVITY_REQUEST_BYTES),
    );
  });
});
