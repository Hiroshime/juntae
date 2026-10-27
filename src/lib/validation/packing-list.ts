import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const optionalId = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null);

export const packingListSchema = z.object({
  title: z.string().trim().min(2, "Informe um título com pelo menos dois caracteres.").max(160),
  description: optionalText(2000),
  eventId: optionalId,
});

export const packingItemSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o item.").max(160),
    quantity: optionalText(100),
    note: optionalText(500),
    responsibleUserId: optionalId,
    responsibleLabel: optionalText(160),
  })
  .refine((input) => !input.responsibleLabel || input.responsibleUserId, {
    message: "Escolha uma pessoa de contato para o casal ou grupo.",
    path: ["responsibleUserId"],
  });

export const packingItemActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim"), responsibleLabel: optionalText(160) }),
  z.object({ action: z.literal("release") }),
  z.object({ action: z.literal("delivered"), delivered: z.boolean() }),
]);

export const packingListStatusSchema = z.object({ closed: z.boolean() });
export type PackingListInput = z.infer<typeof packingListSchema>;
export type PackingItemInput = z.infer<typeof packingItemSchema>;
export type PackingItemAction = z.infer<typeof packingItemActionSchema>;
