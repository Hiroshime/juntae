export type FundCalculationEntry = {
  userId: string;
  type: "DEPOSIT" | "USAGE";
  status: "PENDING" | "APPROVED" | "REJECTED" | "VOIDED";
  amountCents: number;
};

export function calculateCommunityFund(entries: FundCalculationEntry[]) {
  const balances = new Map<string, number>();
  let totalCents = 0;

  for (const entry of entries) {
    if (entry.status !== "APPROVED") continue;
    const effect = entry.type === "DEPOSIT" ? entry.amountCents : -entry.amountCents;
    balances.set(entry.userId, (balances.get(entry.userId) ?? 0) + effect);
    totalCents += effect;
  }

  return { totalCents, balances };
}
