import { describe, expect, it } from "vitest";
import { challengeModerationSchema } from "@/lib/validation/challenge-moderation";

describe("validação da moderação", () => {
  const input = { action: "INVALIDATE", reason: "Treino fora das regras.", expectedVersion: 0 };
  it("aceita desconsiderar/restabelecer com motivo normalizado", () => {
    for (const action of ["INVALIDATE", "RESTORE"])
      expect(
        challengeModerationSchema.parse({ ...input, action, reason: `  ${input.reason}  ` }).reason,
      ).toBe(input.reason);
  });
  it("recusa motivo vazio/curto/excessivo, versão inválida e campos não autorizados", () => {
    for (const changes of [
      { reason: "          " },
      { reason: "curto" },
      { reason: "x".repeat(1001) },
      { expectedVersion: -1 },
      { expectedVersion: 0.5 },
      { expectedVersion: "0" },
      { action: "REMOVE" },
      { score: 999 },
      { actorId: "outro" },
    ])
      expect(challengeModerationSchema.safeParse({ ...input, ...changes }).success).toBe(false);
  });
});
