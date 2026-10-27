import { z } from "zod";
import { parseCivilDate } from "@/lib/dates/civil-date";

export const billingModeSchema = z.enum(["EQUAL", "DAY", "NIGHT"]);
export const billingDateSchema = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");
export const billingSelectionSchema = z
  .object({
    mode: billingModeSchema,
    periods: z
      .array(
        z
          .object({
            date: billingDateSchema,
            userIds: z
              .array(z.string().uuid())
              .max(500)
              .refine((ids) => new Set(ids).size === ids.length, "Há pessoas repetidas."),
          })
          .strict(),
      )
      .max(366)
      .refine(
        (periods) => new Set(periods.map((period) => period.date)).size === periods.length,
        "Há períodos repetidos.",
      ),
  })
  .strict();
export type BillingSelection = z.infer<typeof billingSelectionSchema>;
