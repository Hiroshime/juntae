import { z } from "zod";
import { civilDateInTimeZone, daysBetweenCivilDates, parseCivilDate } from "@/lib/dates/civil-date";

const optionalText = z
  .union([z.string().trim().max(5_000, "A descrição é muito longa."), z.literal(""), z.null()])
  .transform((value) => value || null);

const optionalDateTime = z
  .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
  .transform((value) => value || null);

const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");

const timezone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Informe um timezone IANA válido.");

const base = {
  title: z.string().trim().min(2, "Informe o título da votação.").max(160),
  description: optionalText,
  allowVoteChange: z.boolean().default(true),
  closesAt: optionalDateTime,
};

const labels = z
  .array(z.string().trim().min(1, "Preencha todas as opções.").max(160))
  .min(2, "Informe pelo menos duas opções.")
  .max(20, "Uma votação pode ter no máximo 20 opções.");

const dates = z
  .array(civilDate)
  .min(2, "Selecione pelo menos duas datas.")
  .max(20, "Uma votação pode ter no máximo 20 datas.");

export const createPollSchema = z
  .discriminatedUnion("type", [
    z.object({ ...base, type: z.literal("SINGLE_CHOICE"), options: labels }),
    z.object({ ...base, type: z.literal("MULTIPLE_CHOICE"), options: labels }),
    z.object({
      ...base,
      type: z.literal("DATE_OPTIONS"),
      dates,
      timezone: timezone.default("America/Sao_Paulo"),
    }),
  ])
  .superRefine((value, context) => {
    const values = value.type === "DATE_OPTIONS" ? value.dates : value.options;
    const normalized = values.map((item) => item.toLocaleLowerCase("pt-BR"));
    if (new Set(normalized).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "As opções não podem se repetir.",
        path: [value.type === "DATE_OPTIONS" ? "dates" : "options"],
      });
    }
    if (value.type === "DATE_OPTIONS") {
      const orderedDates = [...value.dates].sort();
      if (orderedDates.length < 2) return;
      const today = civilDateInTimeZone(new Date(), value.timezone);
      if (orderedDates[0] < today) {
        context.addIssue({
          code: "custom",
          message: "As opções de data não podem estar no passado.",
          path: ["dates"],
        });
      }
      const datesAreValid = orderedDates.every((date) => {
        try {
          parseCivilDate(date);
          return true;
        } catch {
          return false;
        }
      });
      if (datesAreValid && daysBetweenCivilDates(orderedDates[0], orderedDates.at(-1)!) > 366) {
        context.addIssue({
          code: "custom",
          message: "As datas devem estar dentro de um intervalo de 367 dias.",
          path: ["dates"],
        });
      }
    }
    if (value.closesAt && new Date(value.closesAt).getTime() <= Date.now() + 60_000) {
      context.addIssue({
        code: "custom",
        message: "O prazo deve estar pelo menos um minuto no futuro.",
        path: ["closesAt"],
      });
    }
  });

export const updatePollSchema = z.object(base).superRefine((value, context) => {
  if (value.closesAt && new Date(value.closesAt).getTime() <= Date.now() + 60_000) {
    context.addIssue({
      code: "custom",
      message: "O prazo deve estar pelo menos um minuto no futuro.",
      path: ["closesAt"],
    });
  }
});

export const castVoteSchema = z.object({
  optionIds: z.array(z.string().uuid()).min(1).max(20),
});

export const pollListQuerySchema = z.object({
  scope: z.enum(["OPEN", "CLOSED", "ALL"]).default("OPEN"),
  take: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type CreatePollInput = z.infer<typeof createPollSchema>;
export type UpdatePollInput = z.infer<typeof updatePollSchema>;
