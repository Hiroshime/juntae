import { z } from "zod";
import { daysBetweenCivilDates, parseCivilDate } from "@/lib/dates/civil-date";
import { fitnessModalityLabels, normalizeModalityName } from "@/lib/fitness-modalities";

export const fitnessModalityIdSchema = z
  .string()
  .max(32)
  .refine(
    (id) => Object.hasOwn(fitnessModalityLabels, id) || /^CUSTOM_[a-f0-9]{24}$/.test(id),
    "Modalidade inválida.",
  );
const modalitySchema = z
  .object({
    id: fitnessModalityIdSchema,
    label: z.string().trim().min(2, "Informe um nome para a modalidade.").max(60),
    points: z.number().int().min(1, "Cada modalidade deve valer de 1 a 1000 pontos.").max(1000),
    pointsPerMetric: z
      .discriminatedUnion("metric", [
        z
          .object({
            metric: z.literal("DURATION"),
            unitValue: z.number().int().min(60).max(86400),
          })
          .strict()
          .refine(({ unitValue }) => unitValue % 60 === 0, "Use minutos inteiros para o tempo."),
        z
          .object({
            metric: z.literal("DISTANCE"),
            unitValue: z.number().int().min(1).max(1000000),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    ({ id, label }) =>
      !Object.hasOwn(fitnessModalityLabels, id) ||
      fitnessModalityLabels[id as keyof typeof fitnessModalityLabels] === label,
    "Use o nome original para modalidades do catálogo.",
  );
const modalitiesSchema = z
  .array(modalitySchema)
  .min(1, "Habilite pelo menos uma modalidade.")
  .max(40, "Use até 40 modalidades.")
  .superRefine((items, ctx) => {
    if (
      new Set(items.map((item) => item.id)).size !== items.length ||
      new Set(items.map((item) => normalizeModalityName(item.label))).size !== items.length
    )
      ctx.addIssue({ code: "custom", message: "Não repita modalidades ou nomes na lista." });
  });

// Add future challenge types as validated variants, not arbitrary JSON from clients.
export const challengeConfigurationSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("FITNESS"),
    // Additive JSON configuration; absence preserves the seven original modalities and global score.
    modalities: modalitiesSchema.optional(),
    activityRules: z
      .object({
        maxDailyActivities: z.number().int().min(1).max(10),
        minDurationMinutes: z.number().int().min(1).max(1440),
        requirePhoto: z.boolean(),
      })
      .strict()
      .default({ maxDailyActivities: 1, minDurationMinutes: 10, requirePhoto: true }),
    scoring: z.discriminatedUnion("metric", [
      z
        .object({
          metric: z.literal("POINTS"),
          pointsPerActivity: z.number().int().min(1).max(1000),
        })
        .strict(),
      z.object({ metric: z.literal("DURATION") }).strict(),
      z.object({ metric: z.literal("DISTANCE") }).strict(),
    ]),
  })
  .strict();

const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return value >= "2000-01-01" && value <= "2100-12-31";
  } catch {
    return false;
  }
}, "Informe uma data válida entre 2000 e 2100.");

export const challengeSchema = z
  .object({
    title: z.string().trim().min(2, "Informe um título com pelo menos 2 caracteres.").max(160),
    description: z.string().trim().max(5000).default(""),
    rules: z.string().trim().min(10, "Descreva as regras com pelo menos 10 caracteres.").max(5000),
    startDate: civilDate,
    endDate: civilDate,
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }, "Informe um fuso horário IANA válido."),
    configuration: challengeConfigurationSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    let days: number;
    try {
      days = daysBetweenCivilDates(input.startDate, input.endDate);
    } catch {
      return;
    }
    if (days < 0 || days > 365)
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "O desafio deve durar de 1 a 366 dias.",
      });
  });

export const challengeActionSchema = z
  .object({ action: z.enum(["JOIN", "LEAVE", "CANCEL"]) })
  .strict();
export const challengeIdsSchema = z.object({ communityId: z.uuid(), challengeId: z.uuid() });
export const challengePageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
export type ChallengeInput = z.infer<typeof challengeSchema>;
export type ChallengeConfiguration = z.infer<typeof challengeConfigurationSchema>;
export type ChallengeAction = z.infer<typeof challengeActionSchema>["action"];
