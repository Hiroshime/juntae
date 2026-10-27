import { Prisma, type CommunityRole } from "@prisma/client";
import { formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import { isTransactionConflict } from "@/lib/db/transaction-conflict";
import type {
  CostShareExpenseInput,
  CreateCostShareInput,
  UpdateCostShareInput,
} from "@/lib/validation/cost-share";
import { resolveEventBilling } from "@/server/domain/event-billing";
import { AppError, assertFound } from "@/server/errors";
import {
  calculateFinancialShare,
  financialEventInclude,
  financialShareInclude,
  financialPerson,
} from "./financial-calculation";

type Tx = Prisma.TransactionClient;
async function requireMembership(userId: string, communityId: string, db: Tx = prisma) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}
function canManage(userId: string, role: CommunityRole, createdById: string) {
  return userId === createdById || role === "OWNER" || role === "ADMIN";
}
function requireManager(manageable: boolean) {
  if (!manageable) throw new AppError("Você não pode administrar este rateio.", 403, "FORBIDDEN");
}
async function transaction<T>(operation: (db: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isTransactionConflict(error)) throw error;
      if (attempt === 2)
        throw new AppError(
          "Os valores mudaram. Atualize a página e tente novamente.",
          409,
          "ACCOUNT_CHANGED",
        );
    }
  }
  throw new AppError("Atualize a página e tente novamente.", 409);
}
async function eventSource(db: Tx, communityId: string, eventId: string | null, lock = false) {
  if (!eventId) return null;
  if (lock)
    await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid AND "communityId" = ${communityId}::uuid FOR UPDATE`;
  const event = await db.event.findFirst({
    where: { id: eventId, communityId },
    include: financialEventInclude(communityId),
  });
  if (!event) throw new AppError("Evento não encontrado nesta comunidade.", 400, "INVALID_EVENT");
  if (lock) {
    if (event.accountClosedAt)
      throw new AppError(
        "Reabra a conta do evento antes de alterar seus rateios.",
        409,
        "ACCOUNT_CLOSED",
      );
    await db.event.update({ where: { id: eventId }, data: { updatedAt: new Date() } });
  }
  return event;
}
async function validateParticipants(db: Tx, communityId: string, ids: string[]) {
  const count = await db.communityMember.count({ where: { communityId, userId: { in: ids } } });
  if (count !== ids.length)
    throw new AppError(
      "Todos os participantes devem pertencer à comunidade.",
      400,
      "INVALID_PARTICIPANTS",
    );
}
async function settings(
  db: Tx,
  communityId: string,
  event: Awaited<ReturnType<typeof eventSource>>,
  input: CreateCostShareInput | UpdateCostShareInput,
  previous?: { allocationType: "SELECTED" | "EVENT" | "DAY"; allocationDate: Date | null },
) {
  const allocationType = input.allocationType ?? previous?.allocationType ?? "SELECTED";
  const date =
    input.allocationDate === undefined
      ? previous?.allocationDate
        ? formatCivilDate(previous.allocationDate)
        : null
      : input.allocationDate;
  if (allocationType !== "SELECTED" && !event)
    throw new AppError(
      "Vincule o rateio a um evento para usar essa aplicação.",
      400,
      "EVENT_REQUIRED",
    );
  if (
    allocationType === "DAY" &&
    (!date || !resolveEventBilling(event!).days.some((day) => day.date === date))
  )
    throw new AppError("Selecione um dia dentro do evento.", 400, "INVALID_ALLOCATION_DATE");
  const participantIds = allocationType === "EVENT" ? [] : input.participantIds;
  if (allocationType !== "EVENT" && participantIds.length < (event ? 1 : 2))
    throw new AppError(
      event ? "Selecione pelo menos uma pessoa." : "Selecione pelo menos duas pessoas.",
    );
  await validateParticipants(db, communityId, participantIds);
  return {
    allocationType,
    allocationDate: allocationType === "DAY" ? parseCivilDate(date!) : null,
    participantIds,
  };
}

export async function getCostShareSources(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  const [members, events] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId },
      orderBy: { joinedAt: "asc" },
      select: {
        userId: true,
        displayName: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
    prisma.event.findMany({
      where: { communityId, status: { not: "CANCELLED" } },
      orderBy: { startsAt: "desc" },
      take: 100,
      include: financialEventInclude(communityId),
    }),
  ]);
  return {
    members: members.map((member) => ({
      id: member.userId,
      name: member.displayName || member.user.name,
      avatarUrl: member.user.avatarUrl,
    })),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      confirmedParticipantIds: event.rsvps.map((rsvp) => rsvp.userId),
      days: resolveEventBilling(event).days,
    })),
  };
}
export async function createCostShare(
  userId: string,
  communityId: string,
  input: CreateCostShareInput,
) {
  return transaction(async (db) => {
    await requireMembership(userId, communityId, db);
    const event = await eventSource(db, communityId, input.eventId, true);
    const config = await settings(db, communityId, event, input);
    const { participantIds, ...allocation } = config;
    return db.costShare.create({
      data: {
        communityId,
        eventId: input.eventId,
        createdById: userId,
        title: input.title,
        description: input.description,
        currency: input.currency,
        ...allocation,
        participants: { create: participantIds.map((id) => ({ userId: id })) },
      },
    });
  });
}
export async function listCostShares(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  const shares = await prisma.costShare.findMany({
    where: { communityId },
    orderBy: { updatedAt: "desc" },
    include: {
      event: { select: { title: true } },
      participants: { select: { userId: true } },
      expenses: { select: { amount: true } },
    },
  });
  return shares.map((share) => ({
    id: share.id,
    title: share.title,
    description: share.description,
    currency: share.currency,
    status: share.status,
    event: share.event,
    allocationType: share.allocationType,
    participantCount: share.participants.length,
    expenseCount: share.expenses.length,
    totalCents: share.expenses.reduce(
      (sum, expense) => sum + Math.round(Number(expense.amount) * 100),
      0,
    ),
    updatedAt: share.updatedAt,
  }));
}
export async function getCostShare(userId: string, communityId: string, costShareId: string) {
  return prisma.$transaction(
    async (db) => {
      const member = await requireMembership(userId, communityId, db);
      const share = assertFound(
        await db.costShare.findFirst({
          where: { id: costShareId, communityId },
          include: {
            ...financialShareInclude(communityId),
            createdBy: { select: { id: true, name: true } },
          },
        }),
        "Rateio não encontrado.",
      );
      const event = await eventSource(db, communityId, share.eventId);
      const billing = event ? resolveEventBilling(event) : undefined;
      const calculated = calculateFinancialShare(share, billing);
      const manageable = canManage(userId, member.role, share.createdById);
      const editable = !event?.accountClosedAt;
      const people = [
        ...share.participants.map((p) => p.user),
        ...share.expenses.map((e) => e.payer),
        ...(event?.rsvps.map((r) => r.user) || []),
      ];
      const participants =
        share.allocationType === "EVENT" &&
        !(share.status === "CLOSED" && share.calculationSnapshot)
          ? calculated.calculation.balances
              .filter((balance) =>
                billing?.periods.some((period) =>
                  period.participants.some((person) => person.id === balance.id),
                ),
              )
              .map((person) => ({
                id: person.id,
                name: person.name,
                avatarUrl: people.find((p) => p.id === person.id)?.avatarUrl || null,
              }))
          : share.participants.map((p) => ({
              ...financialPerson(p.user),
              ...(share.status === "CLOSED" && share.calculationSnapshot
                ? {
                    name:
                      calculated.calculation.balances.find((balance) => balance.id === p.userId)
                        ?.name || financialPerson(p.user).name,
                  }
                : {}),
              avatarUrl: p.user.avatarUrl,
            }));
      return {
        id: share.id,
        title: share.title,
        description: share.description,
        currency: share.currency,
        status: share.status,
        allocationType: share.allocationType,
        allocationDate: share.allocationDate ? formatCivilDate(share.allocationDate) : null,
        event: event
          ? {
              id: event.id,
              title: event.title,
              paymentTrackingEnabled: event.paymentTrackingEnabled,
            }
          : null,
        eventDays: billing?.days || [],
        accountClosed: !!event?.accountClosedAt,
        createdBy: share.createdBy,
        canManage: manageable,
        canAddExpense:
          editable && (manageable || !!event || participants.some((p) => p.id === userId)),
        currentUserIsParticipant: participants.some((p) => p.id === userId),
        participants,
        issues: calculated.issues,
        periods: calculated.periods,
        expenses: share.expenses.map((expense) => ({
          id: expense.id,
          payerId: expense.payerId,
          payerName: financialPerson(expense.payer).name,
          description: expense.description,
          amountCents: Math.round(Number(expense.amount) * 100),
          purchasedAt: formatCivilDate(expense.purchasedAt),
          canEdit: editable && (manageable || expense.payerId === userId),
        })),
        calculation: {
          ...calculated.calculation,
          balances: calculated.calculation.balances.map((balance) => ({
            ...balance,
            avatarUrl: people.find((p) => p.id === balance.id)?.avatarUrl || null,
          })),
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

async function mutateShare<T>(
  userId: string,
  communityId: string,
  costShareId: string,
  operation: (
    db: Tx,
    share: Awaited<ReturnType<typeof loadShare>>,
    manageable: boolean,
    event: Awaited<ReturnType<typeof eventSource>>,
  ) => Promise<T>,
  allowClosed = false,
) {
  return transaction(async (db) => {
    const member = await requireMembership(userId, communityId, db);
    const initial = assertFound(
      await db.costShare.findFirst({ where: { id: costShareId, communityId } }),
      "Rateio não encontrado.",
    );
    const event = await eventSource(db, communityId, initial.eventId, true);
    await db.costShare.update({ where: { id: costShareId }, data: { updatedAt: new Date() } });
    const share = await loadShare(db, communityId, costShareId);
    if (!allowClosed && share.status !== "OPEN")
      throw new AppError("Este rateio está fechado.", 409, "COST_SHARE_CLOSED");
    return operation(db, share, canManage(userId, member.role, share.createdById), event);
  });
}
async function loadShare(db: Tx, communityId: string, costShareId: string) {
  return assertFound(
    await db.costShare.findFirst({
      where: { id: costShareId, communityId },
      include: financialShareInclude(communityId),
    }),
    "Rateio não encontrado.",
  );
}
export async function updateCostShare(
  userId: string,
  communityId: string,
  costShareId: string,
  input: UpdateCostShareInput,
) {
  return mutateShare(userId, communityId, costShareId, async (db, share, manageable, event) => {
    requireManager(manageable);
    const { participantIds, ...allocation } = await settings(db, communityId, event, input, share);
    if (!event && share.expenses.some((expense) => !participantIds.includes(expense.payerId)))
      throw new AppError(
        "Remova as compras de uma pessoa antes de retirá-la do rateio.",
        409,
        "PARTICIPANT_HAS_EXPENSES",
      );
    await db.costShareParticipant.deleteMany({
      where: { costShareId, userId: { notIn: participantIds } },
    });
    await db.costShareParticipant.createMany({
      data: participantIds.map((userId) => ({ costShareId, userId })),
      skipDuplicates: true,
    });
    return db.costShare.update({
      where: { id: costShareId },
      data: { title: input.title, description: input.description, ...allocation },
    });
  });
}
async function validatePayer(
  db: Tx,
  communityId: string,
  share: { id: string; eventId: string | null },
  payerId: string,
) {
  if (share.eventId) {
    if (
      !(await db.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId: payerId } },
      }))
    )
      throw new AppError("O pagador deve pertencer à comunidade.", 400, "INVALID_PAYER");
  } else if (
    !(await db.costShareParticipant.findUnique({
      where: { costShareId_userId: { costShareId: share.id, userId: payerId } },
    }))
  )
    throw new AppError("O pagador deve participar do rateio.", 400, "INVALID_PAYER");
}
export async function createCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  input: CostShareExpenseInput,
) {
  return mutateShare(userId, communityId, costShareId, async (db, share, manageable) => {
    if (!manageable && input.payerId !== userId)
      throw new AppError("Você só pode lançar suas próprias compras.", 403, "FORBIDDEN");
    await validatePayer(db, communityId, share, input.payerId);
    return db.costShareExpense.create({
      data: {
        costShareId,
        payerId: input.payerId,
        createdById: userId,
        description: input.description,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        purchasedAt: parseCivilDate(input.purchasedAt),
      },
    });
  });
}
export async function updateCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  expenseId: string,
  input: CostShareExpenseInput,
) {
  return mutateShare(userId, communityId, costShareId, async (db, share, manageable) => {
    const expense = assertFound(
      share.expenses.find((entry) => entry.id === expenseId),
      "Despesa não encontrada.",
    );
    if (!manageable && (expense.payerId !== userId || input.payerId !== userId))
      throw new AppError("Você não pode alterar esta despesa ou seu pagador.", 403, "FORBIDDEN");
    if (input.payerId !== expense.payerId)
      await validatePayer(db, communityId, share, input.payerId);
    return db.costShareExpense.update({
      where: { id: expense.id },
      data: {
        payerId: input.payerId,
        description: input.description,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        purchasedAt: parseCivilDate(input.purchasedAt),
      },
    });
  });
}
export async function deleteCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  expenseId: string,
) {
  return mutateShare(userId, communityId, costShareId, async (db, share, manageable) => {
    const expense = assertFound(
      share.expenses.find((entry) => entry.id === expenseId),
      "Despesa não encontrada.",
    );
    if (!manageable && expense.payerId !== userId)
      throw new AppError("Você não pode alterar esta despesa.", 403, "FORBIDDEN");
    return db.costShareExpense.delete({ where: { id: expense.id } });
  });
}
export async function setCostShareStatus(
  userId: string,
  communityId: string,
  costShareId: string,
  status: "OPEN" | "CLOSED",
) {
  return mutateShare(
    userId,
    communityId,
    costShareId,
    async (db, share, manageable, event) => {
      requireManager(manageable);
      if (status === share.status) return share;
      const calculated = calculateFinancialShare(
        share,
        event ? resolveEventBilling(event) : undefined,
      );
      if (status === "CLOSED" && calculated.issues.length)
        throw new AppError(calculated.issues.join(" "), 409, "COST_SHARE_INVALID");
      if (share.allocationType === "EVENT") {
        const ids =
          status === "CLOSED" && event
            ? [
                ...new Set(
                  resolveEventBilling(event).periods.flatMap((period) =>
                    period.participants.map((person) => person.id),
                  ),
                ),
              ]
            : [];
        await db.costShareParticipant.deleteMany({ where: { costShareId } });
        if (ids.length)
          await db.costShareParticipant.createMany({
            data: ids.map((userId) => ({ costShareId, userId })),
          });
      }
      return db.costShare.update({
        where: { id: costShareId },
        data: {
          status,
          calculationSnapshot:
            status === "CLOSED"
              ? { ...calculated.calculation, periods: calculated.periods }
              : Prisma.DbNull,
        },
      });
    },
    true,
  );
}
