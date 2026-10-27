export type CostShareCalculationParticipant = {
  id: string;
  name: string;
};

export type CostShareCalculationExpense = {
  payerId: string;
  amountCents: number;
};

export type CostShareBalance = CostShareCalculationParticipant & {
  paidCents: number;
  shareCents: number;
  balanceCents: number;
};

export type CostShareTransfer = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountCents: number;
};

export function calculateCostShare(
  participants: CostShareCalculationParticipant[],
  expenses: CostShareCalculationExpense[],
  distribution?: {
    charges?: Map<string, number>;
    payers?: CostShareCalculationParticipant[];
    allowSingle?: boolean;
  },
) {
  if (participants.length < (distribution?.allowSingle ? 0 : 2))
    throw new Error("AT_LEAST_TWO_PARTICIPANTS");
  const beneficiaries = [...participants].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(beneficiaries.map((participant) => participant.id)).size !== beneficiaries.length) {
    throw new Error("DUPLICATE_PARTICIPANT");
  }

  const everyone = new Map(
    [...beneficiaries, ...(distribution?.payers || [])].map((person) => [person.id, person]),
  );
  const ordered = [...everyone.values()].sort((a, b) => a.id.localeCompare(b.id));
  const participantIds = new Set(ordered.map((participant) => participant.id));
  const paid = new Map(ordered.map((participant) => [participant.id, 0]));
  let totalCents = 0;
  for (const expense of expenses) {
    if (!participantIds.has(expense.payerId)) throw new Error("UNKNOWN_PAYER");
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new Error("INVALID_AMOUNT");
    }
    totalCents += expense.amountCents;
    if (!Number.isSafeInteger(totalCents)) throw new Error("INVALID_AMOUNT");
    paid.set(expense.payerId, paid.get(expense.payerId)! + expense.amountCents);
  }

  const charges =
    distribution?.charges ||
    new Map(
      beneficiaries.map((person, index) => [
        person.id,
        Math.floor(totalCents / beneficiaries.length) +
          (index < totalCents % beneficiaries.length ? 1 : 0),
      ]),
    );
  for (const [id, value] of charges) {
    if (!participantIds.has(id) || !Number.isSafeInteger(value) || value < 0)
      throw new Error("INVALID_ALLOCATION");
  }
  if ([...charges.values()].reduce((a, b) => a + b, 0) > totalCents)
    throw new Error("INVALID_ALLOCATION");
  const balances: CostShareBalance[] = ordered.map((participant) => {
    const shareCents = charges.get(participant.id) || 0;
    const paidCents = paid.get(participant.id)!;
    return { ...participant, paidCents, shareCents, balanceCents: paidCents - shareCents };
  });

  const debtors = balances
    .filter((balance) => balance.balanceCents < 0)
    .map((balance) => ({ ...balance, remaining: -balance.balanceCents }))
    .sort(
      (first, second) => second.remaining - first.remaining || first.id.localeCompare(second.id),
    );
  const creditors = balances
    .filter((balance) => balance.balanceCents > 0)
    .map((balance) => ({ ...balance, remaining: balance.balanceCents }))
    .sort(
      (first, second) => second.remaining - first.remaining || first.id.localeCompare(second.id),
    );
  const transfers: CostShareTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.remaining, creditor.remaining);
    transfers.push({
      fromUserId: debtor.id,
      fromName: debtor.name,
      toUserId: creditor.id,
      toName: creditor.name,
      amountCents,
    });
    debtor.remaining -= amountCents;
    creditor.remaining -= amountCents;
    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return {
    totalCents,
    averagePerPersonCents: beneficiaries.length ? totalCents / beneficiaries.length : 0,
    balances,
    transfers,
  };
}
import { z } from "zod";

const money = z.number().int().nonnegative().safe();
export const costShareCalculationSchema = z.object({
  totalCents: money,
  averagePerPersonCents: z.number().nonnegative().finite(),
  balances: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      paidCents: money,
      shareCents: money,
      balanceCents: z.number().int().safe(),
    }),
  ),
  transfers: z.array(
    z.object({
      fromUserId: z.string(),
      fromName: z.string(),
      toUserId: z.string(),
      toName: z.string(),
      amountCents: money,
    }),
  ),
});
export type CostShareCalculation = z.infer<typeof costShareCalculationSchema>;
