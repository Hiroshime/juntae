import { z } from "zod";

export const challengeModerationSchema = z
  .object({
    action: z.enum(["INVALIDATE", "RESTORE"]),
    reason: z.string().trim().min(10, "Explique o motivo com pelo menos 10 caracteres.").max(1000),
    expectedVersion: z.number().int().min(0).max(2147483647),
  })
  .strict();

export type ChallengeModerationInput = z.infer<typeof challengeModerationSchema>;
export const challengeAuditLabels = {
  INVALIDATE: "Treino desconsiderado",
  RESTORE: "Treino restabelecido",
  REMOVE: "Treino removido pelo autor",
  FINALIZE: "Resultado consolidado",
};
