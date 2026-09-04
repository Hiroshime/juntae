import { Prisma, type CommunityRole } from "@prisma/client";
import { formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import type {
  CostShareExpenseInput,
  CreateCostShareInput,
  UpdateCostShareInput,
} from "@/lib/validation/cost-share";
import { calculateCostShare } from "@/server/domain/cost-shares";
import { AppError, assertFound } from "@/server/errors";

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function canManage(userId: string, role: CommunityRole, createdById: string) {
  return userId === createdById || role === "OWNER" || role === "ADMIN";
}

async function assertCommunityParticipants(communityId: string, participantIds: string[]) {
  const count = await prisma.communityMember.count({
    where: { communityId, userId: { in: participantIds } },
  });
  if (count !== participantIds.length) {
    throw new AppError(
      "Todos os participantes devem pertencer à comunidade.",
      400,
      "INVALID_PARTICIPANTS",
    );
  }
}

async function assertCommunityEvent(communityId: string, eventId: string | null) {
  if (!eventId) return;
  const event = await prisma.event.findFirst({
    where: { id: eventId, communityId },
    select: { id: true },
  });
  if (!event) throw new AppError("Evento não encontrado nesta comunidade.", 400, "INVALID_EVENT");
}

function decimalToCents(value: Prisma.Decimal) {
  return Math.round(value.toNumber() * 100);
}

function memberName(member: { displayName: string | null; user: { name: string } }) {
  return member.displayName || member.user.name;
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
      select: {
        id: true,
        title: true,
        startsAt: true,
        rsvps: { where: { status: "GOING" }, select: { userId: true } },
      },
    }),
  ]);
  return {
    members: members.map((member) => ({
      id: member.userId,
      name: memberName(member),
      avatarUrl: member.user.avatarUrl,
    })),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      confirmedParticipantIds: event.rsvps.map((rsvp) => rsvp.userId),
    })),
  };
}

export async function createCostShare(
  userId: string,
  communityId: string,
  input: CreateCostShareInput,
) {
  await requireMembership(userId, communityId);
  await Promise.all([
    assertCommunityParticipants(communityId, input.participantIds),
    assertCommunityEvent(communityId, input.eventId),
  ]);
  return prisma.costShare.create({
    data: {
      communityId,
      eventId: input.eventId,
      createdById: userId,
      title: input.title,
      description: input.description,
      currency: input.currency,
      participants: {
        create: input.participantIds.map((participantId) => ({ userId: participantId })),
      },
    },
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
    participantCount: share.participants.length,
    expenseCount: share.expenses.length,
    totalCents: share.expenses.reduce(
      (total, expense) => total + decimalToCents(expense.amount),
      0,
    ),
    updatedAt: share.updatedAt,
  }));
}

export async function getCostShare(userId: string, communityId: string, costShareId: string) {
  const membership = await requireMembership(userId, communityId);
  const share = assertFound(
    await prisma.costShare.findFirst({
      where: { id: costShareId, communityId },
      include: {
        event: { select: { id: true, title: true } },
        createdBy: { select: { id: true, name: true } },
        participants: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                memberships: { where: { communityId }, select: { displayName: true } },
              },
            },
          },
        },
        expenses: {
          orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
          include: {
            payer: {
              select: {
                id: true,
                name: true,
                memberships: { where: { communityId }, select: { displayName: true } },
              },
            },
          },
        },
      },
    }),
    "Rateio não encontrado.",
  );
  const manageable = canManage(userId, membership.role, share.createdById);
  const participants = share.participants.map((participant) => ({
    id: participant.userId,
    name: participant.user.memberships[0]?.displayName || participant.user.name,
    avatarUrl: participant.user.avatarUrl,
  }));
  const calculation = calculateCostShare(
    participants,
    share.expenses.map((expense) => ({
      payerId: expense.payerId,
      amountCents: decimalToCents(expense.amount),
    })),
  );
  return {
    id: share.id,
    title: share.title,
    description: share.description,
    currency: share.currency,
    status: share.status,
    event: share.event,
    createdBy: share.createdBy,
    canManage: manageable,
    currentUserIsParticipant: participants.some((participant) => participant.id === userId),
    participants,
    expenses: share.expenses.map((expense) => ({
      id: expense.id,
      payerId: expense.payerId,
      payerName: expense.payer.memberships[0]?.displayName || expense.payer.name,
      description: expense.description,
      amountCents: decimalToCents(expense.amount),
      purchasedAt: formatCivilDate(expense.purchasedAt),
      canEdit: manageable || expense.payerId === userId,
    })),
    calculation: {
      ...calculation,
      balances: calculation.balances.map((balance) => ({
        ...balance,
        avatarUrl:
          participants.find((participant) => participant.id === balance.id)?.avatarUrl ?? null,
      })),
    },
  };
}

async function requireManageableShare(userId: string, communityId: string, costShareId: string) {
  const membership = await requireMembership(userId, communityId);
  const share = assertFound(
    await prisma.costShare.findFirst({ where: { id: costShareId, communityId } }),
    "Rateio não encontrado.",
  );
  if (!canManage(userId, membership.role, share.createdById)) {
    throw new AppError("Você não pode administrar este rateio.", 403, "FORBIDDEN");
  }
  return share;
}

function assertOpen(status: "OPEN" | "CLOSED") {
  if (status !== "OPEN") throw new AppError("Este rateio está fechado.", 409, "COST_SHARE_CLOSED");
}

export async function updateCostShare(
  userId: string,
  communityId: string,
  costShareId: string,
  input: UpdateCostShareInput,
) {
  const share = await requireManageableShare(userId, communityId, costShareId);
  assertOpen(share.status);
  await assertCommunityParticipants(communityId, input.participantIds);
  const payerIds = await prisma.costShareExpense.findMany({
    where: { costShareId },
    distinct: ["payerId"],
    select: { payerId: true },
  });
  if (payerIds.some((payer) => !input.participantIds.includes(payer.payerId))) {
    throw new AppError(
      "Remova as compras de uma pessoa antes de retirá-la do rateio.",
      409,
      "PARTICIPANT_HAS_EXPENSES",
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.costShareParticipant.deleteMany({
      where: { costShareId, userId: { notIn: input.participantIds } },
    });
    await tx.costShareParticipant.createMany({
      data: input.participantIds.map((participantId) => ({ costShareId, userId: participantId })),
      skipDuplicates: true,
    });
    return tx.costShare.update({
      where: { id: costShareId },
      data: { title: input.title, description: input.description },
    });
  });
}

async function requireShareForExpense(userId: string, communityId: string, costShareId: string) {
  const membership = await requireMembership(userId, communityId);
  const share = assertFound(
    await prisma.costShare.findFirst({ where: { id: costShareId, communityId } }),
    "Rateio não encontrado.",
  );
  assertOpen(share.status);
  return { share, role: membership.role };
}

async function assertPayer(costShareId: string, payerId: string) {
  const participant = await prisma.costShareParticipant.findUnique({
    where: { costShareId_userId: { costShareId, userId: payerId } },
  });
  if (!participant)
    throw new AppError("O pagador deve participar do rateio.", 400, "INVALID_PAYER");
}

export async function createCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  input: CostShareExpenseInput,
) {
  const { share, role } = await requireShareForExpense(userId, communityId, costShareId);
  const manageable = canManage(userId, role, share.createdById);
  if (!manageable && input.payerId !== userId) {
    throw new AppError("Você só pode lançar suas próprias compras.", 403, "FORBIDDEN");
  }
  await assertPayer(costShareId, input.payerId);
  return prisma.costShareExpense.create({
    data: {
      costShareId,
      payerId: input.payerId,
      createdById: userId,
      description: input.description,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      purchasedAt: parseCivilDate(input.purchasedAt),
    },
  });
}

async function requireEditableExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  expenseId: string,
) {
  const { share, role } = await requireShareForExpense(userId, communityId, costShareId);
  const expense = assertFound(
    await prisma.costShareExpense.findFirst({ where: { id: expenseId, costShareId } }),
    "Despesa não encontrada.",
  );
  const manageable = canManage(userId, role, share.createdById);
  if (!manageable && expense.payerId !== userId) {
    throw new AppError("Você não pode alterar esta despesa.", 403, "FORBIDDEN");
  }
  return { expense, manageable };
}

export async function updateCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  expenseId: string,
  input: CostShareExpenseInput,
) {
  const { expense, manageable } = await requireEditableExpense(
    userId,
    communityId,
    costShareId,
    expenseId,
  );
  if (!manageable && input.payerId !== expense.payerId) {
    throw new AppError("Você não pode trocar o pagador desta despesa.", 403, "FORBIDDEN");
  }
  await assertPayer(costShareId, input.payerId);
  return prisma.costShareExpense.update({
    where: { id: expense.id },
    data: {
      payerId: input.payerId,
      description: input.description,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      purchasedAt: parseCivilDate(input.purchasedAt),
    },
  });
}

export async function deleteCostShareExpense(
  userId: string,
  communityId: string,
  costShareId: string,
  expenseId: string,
) {
  const { expense } = await requireEditableExpense(userId, communityId, costShareId, expenseId);
  await prisma.costShareExpense.delete({ where: { id: expense.id } });
}

export async function setCostShareStatus(
  userId: string,
  communityId: string,
  costShareId: string,
  status: "OPEN" | "CLOSED",
) {
  await requireManageableShare(userId, communityId, costShareId);
  return prisma.costShare.update({ where: { id: costShareId }, data: { status } });
}
