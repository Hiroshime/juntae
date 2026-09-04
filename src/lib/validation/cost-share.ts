import { z } from "zod";
import { parseCivilDate } from "@/lib/dates/civil-date";

const optionalText = z
  .union([z.string().trim().max(2_000, "A descrição é muito longa."), z.literal(""), z.null()])
  .transform((value) => value || null);

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .transform((value) => value || null);

const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");

const participantIds = z
  .array(z.string().uuid())
  .min(2, "Selecione pelo menos duas pessoas.")
  .max(500)
  .refine((values) => new Set(values).size === values.length, "Há participantes repetidos.");

export const createCostShareSchema = z.object({
  title: z.string().trim().min(2, "Informe o título do rateio.").max(160),
  description: optionalText,
  eventId: optionalUuid,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Informe uma moeda válida."),
  participantIds,
});

export const updateCostShareSchema = createCostShareSchema.pick({
  title: true,
  description: true,
  participantIds: true,
});

export const costShareStatusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });

export const costShareExpenseSchema = z.object({
  description: z.string().trim().min(2, "Informe o item comprado.").max(200),
  amount: z
    .number()
    .positive("O valor deve ser positivo.")
    .max(99_999_999.99)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      "Informe no máximo duas casas decimais.",
    ),
  payerId: z.string().uuid(),
  purchasedAt: civilDate,
});

export type CreateCostShareInput = z.infer<typeof createCostShareSchema>;
export type UpdateCostShareInput = z.infer<typeof updateCostShareSchema>;
export type CostShareExpenseInput = z.infer<typeof costShareExpenseSchema>;
