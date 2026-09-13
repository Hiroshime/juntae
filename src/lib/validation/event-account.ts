import { z } from "zod";

export const eventAccountActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ENABLE") }),
  z.object({ action: z.literal("DISABLE") }),
  z.object({ action: z.literal("REOPEN") }),
  z.object({ action: z.literal("CLOSE"), revision: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({
    action: z.literal("PAYMENT"),
    userId: z.string().uuid(),
    direction: z.enum(["RECEIVED", "REFUNDED"]),
    amountCents: z.number().int().positive().safe(),
    note: z.string().trim().max(500).default(""),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("VOID"), paymentId: z.string().uuid() }),
]);
export type EventAccountAction = z.infer<typeof eventAccountActionSchema>;
