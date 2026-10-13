import { z } from "zod";
import { calculateCostShare, type CostShareCalculationParticipant } from "./cost-shares";

const cents = z.number().int().safe();
export const eventAccountSummarySchema = z.object({
  currency: z.string(),
  eventCostCents: cents,
  sharesTotalCents: cents,
  fundCreditsTotalCents: cents.default(0),
  totalCents: cents,
  confirmedCount: z.number().int(),
  pendingCents: cents,
  refundableCents: cents,
  shares: z.array(z.object({ id: z.string(), title: z.string(), totalCents: cents })),
  people: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      eventShareCents: cents,
      costSharesCents: cents,
      purchasesCents: cents,
      receivedCents: cents,
      fundCreditCents: cents.default(0),
      refundedCents: cents,
      dueCents: cents,
    }),
  ),
});
export type EventAccountSummary = z.infer<typeof eventAccountSummarySchema>;
type Person = CostShareCalculationParticipant;
export type AccountPayment = {
  userId: string;
  amountCents: number;
  direction: "RECEIVED" | "REFUNDED";
};
export type AccountFundCredit = {
  userId: string;
  amountCents: number;
};

// Positive due = participant owes the event; negative due = the event owes them.
// RECEIVED payments may be recorded as installments or advance payments, even
// after the due reaches zero. A negative due is then the participant's credit.
export function calculateEventAccount(input: {
  currency: string;
  eventCostCents: number;
  confirmed: Person[];
  shares: Array<{
    id: string;
    title: string;
    currency: string;
    participants: Person[];
    expenses: Array<{ payerId: string; amountCents: number }>;
  }>;
  payments: Array<AccountPayment & { name: string }>;
  fundCredits?: Array<AccountFundCredit & { name: string }>;
}) {
  const people = new Map<string, EventAccountSummary["people"][number]>();
  const ensure = (person: Person) => {
    if (!people.has(person.id))
      people.set(person.id, {
        ...person,
        eventShareCents: 0,
        costSharesCents: 0,
        purchasesCents: 0,
        receivedCents: 0,
        fundCreditCents: 0,
        refundedCents: 0,
        dueCents: 0,
      });
    return people.get(person.id)!;
  };
  const issues: string[] = [];
  if (input.eventCostCents > 0 && !input.confirmed.length) {
    issues.push("Confirme pelo menos uma pessoa para dividir o custo do evento.");
  }
  const confirmed = [...input.confirmed].sort((a, b) => a.id.localeCompare(b.id));
  confirmed.forEach((person, index) => {
    ensure(person).eventShareCents =
      Math.floor(input.eventCostCents / confirmed.length) +
      (index < input.eventCostCents % confirmed.length ? 1 : 0);
  });
  const shares: EventAccountSummary["shares"] = [];
  for (const share of input.shares) {
    if (share.currency !== input.currency) {
      issues.push(
        `O rateio “${share.title}” usa ${share.currency}. Todos os rateios devem usar ${input.currency}.`,
      );
      continue;
    }
    const calculation = calculateCostShare(share.participants, share.expenses);
    shares.push({ id: share.id, title: share.title, totalCents: calculation.totalCents });
    for (const balance of calculation.balances) {
      const person = ensure(balance);
      person.costSharesCents += balance.shareCents;
      person.purchasesCents += balance.paidCents;
    }
  }
  for (const payment of input.payments) {
    const person = ensure({ id: payment.userId, name: payment.name });
    if (payment.direction === "RECEIVED") person.receivedCents += payment.amountCents;
    else person.refundedCents += payment.amountCents;
  }
  for (const credit of input.fundCredits ?? []) {
    const person = ensure({ id: credit.userId, name: credit.name });
    person.fundCreditCents += credit.amountCents;
  }
  const rows = [...people.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  for (const person of rows) {
    person.dueCents =
      person.eventShareCents +
      person.costSharesCents -
      person.purchasesCents -
      person.receivedCents -
      person.fundCreditCents +
      person.refundedCents;
  }
  const sharesTotalCents = shares.reduce((sum, share) => sum + share.totalCents, 0);
  const fundCreditsTotalCents = rows.reduce((sum, person) => sum + person.fundCreditCents, 0);
  const summary = eventAccountSummarySchema.parse({
    currency: input.currency,
    eventCostCents: input.eventCostCents,
    sharesTotalCents,
    fundCreditsTotalCents,
    totalCents: input.eventCostCents + sharesTotalCents,
    confirmedCount: confirmed.length,
    pendingCents: rows.reduce((sum, person) => sum + Math.max(0, person.dueCents), 0),
    refundableCents: rows.reduce((sum, person) => sum + Math.max(0, -person.dueCents), 0),
    people: rows,
    shares,
  });
  return { summary, issues };
}
