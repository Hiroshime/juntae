import { z } from "zod";
import { civilDateInTimeZone, daysBetweenCivilDates, parseCivilDate } from "@/lib/dates/civil-date";

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const optionalText = (max: number, message: string) =>
  z
    .union([z.string().trim().max(max, message), z.literal(""), z.null()])
    .transform((value) => value || null);

const optionalUrl = z
  .union([
    z.string().trim().url("Informe uma URL válida.").max(2_000).refine(isHttpUrl, {
      message: "Use um link HTTP ou HTTPS.",
    }),
    z.literal(""),
    z.null(),
  ])
  .transform((value) => value || null);

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Informe o título do evento.").max(160),
    description: optionalText(5_000, "A descrição é muito longa."),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z
      .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
      .transform((value) => value || null),
    allDay: z.boolean().default(false),
    timezone: z.string().max(64).refine(isIanaTimezone, "Informe um timezone IANA válido."),
    locationName: optionalText(160, "O nome do local é muito longo."),
    locationAddress: optionalText(1_000, "O endereço é muito longo."),
    locationUrl: optionalUrl,
    estimatedCost: z.union([z.number().min(0).max(99_999_999.99), z.null()]).default(null),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Informe uma moeda válida."),
    participantLimit: z.union([z.number().int().min(1).max(100_000), z.null()]).default(null),
    allowMaybe: z.boolean().default(true),
    allowPartialAttendance: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
      context.addIssue({
        code: "custom",
        message: "O término deve ser posterior ao início.",
        path: ["endsAt"],
      });
      return;
    }
    if (!value.allowPartialAttendance) return;
    let duration: number;
    try {
      const startDate = civilDateInTimeZone(new Date(value.startsAt), value.timezone);
      const effectiveEnd = value.endsAt
        ? new Date(new Date(value.endsAt).getTime() - 1)
        : new Date(value.startsAt);
      const endDate = civilDateInTimeZone(effectiveEnd, value.timezone);
      duration = daysBetweenCivilDates(startDate, endDate);
    } catch {
      return;
    }
    if (duration < 1) {
      context.addIssue({
        code: "custom",
        message: "A escolha de dias só pode ser habilitada em eventos com mais de um dia.",
        path: ["allowPartialAttendance"],
      });
    } else if (duration > 365) {
      context.addIssue({
        code: "custom",
        message: "Eventos com escolha de dias podem durar no máximo 366 dias.",
        path: ["endsAt"],
      });
    }
  });

const attendanceDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data de participação válida.");

export const rsvpSchema = z
  .object({
    status: z.enum(["GOING", "MAYBE", "NOT_GOING"]),
    attendanceDates: z
      .union([z.array(attendanceDate).min(1).max(366), z.null()])
      .optional()
      .default(null),
  })
  .superRefine((value, context) => {
    if (value.status === "NOT_GOING" && value.attendanceDates) {
      context.addIssue({
        code: "custom",
        message: "Quem não vai não deve selecionar dias de participação.",
        path: ["attendanceDates"],
      });
    }
    if (
      value.attendanceDates &&
      new Set(value.attendanceDates).size !== value.attendanceDates.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Os dias de participação não podem se repetir.",
        path: ["attendanceDates"],
      });
    }
  });

export const eventListQuerySchema = z.object({
  scope: z.enum(["UPCOMING", "PAST", "ALL"]).default("UPCOMING"),
  take: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type EventInput = z.infer<typeof eventSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
