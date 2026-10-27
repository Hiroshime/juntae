import { Prisma } from "@prisma/client";
import { formatCivilDate } from "@/lib/dates/civil-date";
import { calculateCostShare, costShareCalculationSchema } from "@/server/domain/cost-shares";
import {
  allocateByPeriods,
  resolveEventBilling,
  periodAllocationSchema,
  type BillingPeriod,
} from "@/server/domain/event-billing";

const financialShareSnapshotSchema = costShareCalculationSchema.extend({
  periods: periodAllocationSchema.array().default([]),
});

export const financialPersonSelection = (communityId: string) =>
  ({
    id: true,
    name: true,
    avatarUrl: true,
    memberships: { where: { communityId }, select: { displayName: true } },
  }) satisfies Prisma.UserSelect;
export function financialShareInclude(communityId: string) {
  const user = { select: financialPersonSelection(communityId) };
  return {
    participants: { include: { user } },
    expenses: { orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], include: { payer: user } },
  } satisfies Prisma.CostShareInclude;
}
export type FinancialShare = Prisma.CostShareGetPayload<{
  include: ReturnType<typeof financialShareInclude>;
}>;
export const financialEventInclude = (communityId: string) =>
  ({
    rsvps: {
      where: { status: "GOING", user: { memberships: { some: { communityId } } } },
      orderBy: { userId: "asc" },
      include: { attendanceDays: true, user: { select: financialPersonSelection(communityId) } },
    },
  }) satisfies Prisma.EventInclude;
export function financialPerson(user: {
  id: string;
  name: string;
  memberships: { displayName: string | null }[];
}) {
  return { id: user.id, name: user.memberships[0]?.displayName || user.name };
}

export function calculateFinancialShare(
  share: FinancialShare,
  billing?: ReturnType<typeof resolveEventBilling>,
) {
  if (share.status === "CLOSED" && share.calculationSnapshot) {
    const { periods, ...calculation } = financialShareSnapshotSchema.parse(
      share.calculationSnapshot,
    );
    return {
      calculation,
      issues: [] as string[],
      periods,
    };
  }
  const expenses = share.expenses.map((expense) => ({
    payerId: expense.payerId,
    amountCents: Math.round(Number(expense.amount) * 100),
  }));
  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  let periods: BillingPeriod[];
  const issues: string[] = [];
  if (share.allocationType === "EVENT") {
    periods = billing?.periods || [];
    issues.push(...(billing?.issues || []));
    if (!billing)
      issues.push("O evento foi removido. Selecione as pessoas deste rateio antes de continuar.");
  } else {
    periods = [
      {
        date: share.allocationDate ? formatCivilDate(share.allocationDate) : "",
        label:
          share.allocationType === "DAY"
            ? `Dia ${formatCivilDate(share.allocationDate!)}`
            : "Pessoas selecionadas",
        participants: share.participants.map((participant) => financialPerson(participant.user)),
      },
    ];
    if (
      share.allocationType === "DAY" &&
      (!billing || !billing.days.some((day) => day.date === formatCivilDate(share.allocationDate!)))
    )
      issues.push("O dia deste rateio não está mais no evento. Revise a aplicação da despesa.");
  }
  const allocation = allocateByPeriods(total, periods);
  issues.push(...allocation.issues);
  const participants = [
    ...new Map(
      periods.flatMap((period) => period.participants).map((person) => [person.id, person]),
    ).values(),
  ];
  const calculation = calculateCostShare(participants, expenses, {
    charges: allocation.charges,
    payers: share.expenses.map((expense) => financialPerson(expense.payer)),
    allowSingle: true,
  });
  if (issues.length) calculation.transfers = [];
  return { calculation, issues: [...new Set(issues)], periods: allocation.breakdown };
}
