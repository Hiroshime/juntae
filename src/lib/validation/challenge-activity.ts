import { z } from "zod";
import { parseCivilDate } from "@/lib/dates/civil-date";
import { challengeIdsSchema, fitnessModalityIdSchema } from "@/lib/validation/challenge";

export const challengeActivitySchema = z
  .object({
    clientRequestId: z.uuid(),
    title: z.string().trim().min(2, "Informe o nome do treino.").max(160),
    notes: z.string().trim().max(2000).default(""),
    activityType: fitnessModalityIdSchema,
    performedOn: z.string().refine((value) => {
      try {
        parseCivilDate(value);
        return true;
      } catch {
        return false;
      }
    }, "Informe uma data válida."),
    durationSeconds: z.number().int().min(1).max(86400),
    distanceMeters: z.number().int().min(0).max(1000000).nullable().default(null),
  })
  .strict();
export const challengeActivityIdsSchema = challengeIdsSchema.extend({ activityId: z.uuid() });
export const challengePhotoIdsSchema = challengeActivityIdsSchema.extend({ photoId: z.uuid() });
export type ChallengeActivityInput = z.infer<typeof challengeActivitySchema>;
