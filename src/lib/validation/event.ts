import { z } from "zod";

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
  })
  .refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
    message: "O término deve ser posterior ao início.",
    path: ["endsAt"],
  });

export const rsvpSchema = z.object({ status: z.enum(["GOING", "MAYBE", "NOT_GOING"]) });

export const eventListQuerySchema = z.object({
  scope: z.enum(["UPCOMING", "PAST", "ALL"]).default("UPCOMING"),
  take: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type EventInput = z.infer<typeof eventSchema>;
