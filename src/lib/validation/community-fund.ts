import { z } from "zod";
import { isCivilMonth, parseCivilDate } from "@/lib/dates/civil-date";

const cents = z.number().int().positive("Informe um valor positivo.").max(100_000_000).safe();
const civilDate = z.string().refine((value) => {
  try {
    parseCivilDate(value);
    return true;
  } catch {
    return false;
  }
}, "Informe uma data válida.");
const note = z.string().trim().max(500, "O texto é muito longo.").default("");
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .transform((value) => value || null);

export const communityFundDepositSchema = z.object({
  amountCents: cents,
  referenceMonth: z.string().refine(isCivilMonth, "Informe um mês válido."),
  effectiveDate: civilDate,
  note,
});

export const communityFundUsageSchema = z.object({
  userId: z.string().uuid(),
  eventId: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .transform((value) => value || null),
  amountCents: cents,
  effectiveDate: civilDate,
  note: z.string().trim().min(2, "Explique onde o saldo será usado.").max(500),
});

export const communityFundSettingsSchema = z.object({
  monthlyContributionCents: z.union([cents, z.null()]),
  pixKey: optionalText(320),
  pixRecipientName: optionalText(120),
  pixCopyPaste: optionalText(1_000),
});

export const communityFundEntryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE") }),
  z.object({ action: z.literal("REJECT"), note: z.string().trim().min(2).max(500) }),
  z.object({ action: z.literal("VOID"), note: z.string().trim().min(2).max(500) }),
  z.object({ action: z.literal("CANCEL") }),
]);

export type CommunityFundDepositInput = z.infer<typeof communityFundDepositSchema>;
export type CommunityFundUsageInput = z.infer<typeof communityFundUsageSchema>;
export type CommunityFundSettingsInput = z.infer<typeof communityFundSettingsSchema>;
export type CommunityFundEntryAction = z.infer<typeof communityFundEntryActionSchema>;
