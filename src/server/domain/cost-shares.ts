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
) {
  if (participants.length < 2) throw new Error("AT_LEAST_TWO_PARTICIPANTS");
  const ordered = [...participants].sort((first, second) => first.id.localeCompare(second.id));
  if (new Set(ordered.map((participant) => participant.id)).size !== ordered.length) {
    throw new Error("DUPLICATE_PARTICIPANT");
  }

  const participantIds = new Set(ordered.map((participant) => participant.id));
  const paid = new Map(ordered.map((participant) => [participant.id, 0]));
  let totalCents = 0;
  for (const expense of expenses) {
    if (!participantIds.has(expense.payerId)) throw new Error("UNKNOWN_PAYER");
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new Error("INVALID_AMOUNT");
    }
    totalCents += expense.amountCents;
    paid.set(expense.payerId, paid.get(expense.payerId)! + expense.amountCents);
  }

  const baseShare = Math.floor(totalCents / ordered.length);
  const remainder = totalCents % ordered.length;
  const balances: CostShareBalance[] = ordered.map((participant, index) => {
    const shareCents = baseShare + (index < remainder ? 1 : 0);
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
    averagePerPersonCents: totalCents / ordered.length,
    balances,
    transfers,
  };
}
