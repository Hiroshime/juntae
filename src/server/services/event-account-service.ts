import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { eventAccountActionSchema, type EventAccountAction } from "@/lib/validation/event-account";
import { calculateEventAccount, eventAccountSummarySchema } from "@/server/domain/event-account";
import { AppError, assertFound } from "@/server/errors";

async function loadAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  communityId: string,
  eventId: string,
) {
  const membership = assertFound(
    await tx.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
  const personSelection = {
    id: true,
    name: true,
    memberships: { where: { communityId }, select: { displayName: true } },
  } satisfies Prisma.UserSelect;
  const event = assertFound(
    await tx.event.findFirst({
      where: { id: eventId, communityId },
      include: {
        rsvps: { where: { status: "GOING" }, include: { user: { select: personSelection } } },
        costShares: {
          orderBy: { id: "asc" },
          include: {
            participants: { include: { user: { select: personSelection } } },
            expenses: { select: { payerId: true, amount: true } },
          },
        },
        payments: {
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          include: {
            user: { select: personSelection },
            recordedBy: { select: { name: true } },
            voidedBy: { select: { name: true } },
          },
        },
      },
    }),
    "Evento não encontrado.",
  );
  const canManage = event.createdById === userId || membership.role !== "MEMBER";
  const person = (user: {
    id: string;
    name: string;
    memberships: Array<{ displayName: string | null }>;
  }) => ({ id: user.id, name: user.memberships[0]?.displayName || user.name });
  const payments = event.payments.map((payment) => ({
    id: payment.id,
    userId: payment.userId,
    name: person(payment.user).name,
    amountCents: Number(payment.amountCents),
    direction: payment.direction === "RECEIVED" ? ("RECEIVED" as const) : ("REFUNDED" as const),
    note: payment.note,
    createdAt: payment.createdAt.toISOString(),
    recordedBy: payment.recordedBy.name,
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidedBy: payment.voidedBy?.name ?? null,
  }));
  const calculation = !event.paymentTrackingEnabled
    ? null
    : event.accountClosedAt
      ? { summary: eventAccountSummarySchema.parse(event.accountSnapshot), issues: [] }
      : calculateEventAccount({
          currency: event.currency,
          eventCostCents: Math.round(Number(event.estimatedCost ?? 0) * 100),
          confirmed: event.rsvps.map((rsvp) => person(rsvp.user)),
          shares: event.costShares.map((share) => ({
            id: share.id,
            title: share.title,
            currency: share.currency,
            participants: share.participants.map((participant) => person(participant.user)),
            expenses: share.expenses.map((expense) => ({
              payerId: expense.payerId,
              amountCents: Math.round(Number(expense.amount) * 100),
            })),
          })),
          payments: payments.filter((payment) => !payment.voidedAt),
        });
  return {
    enabled: event.paymentTrackingEnabled,
    closedAt: event.accountClosedAt?.toISOString() ?? null,
    canManage,
    summary: calculation?.summary ?? null,
    issues: calculation?.issues ?? [],
    payments,
    revision: createHash("sha256").update(JSON.stringify({ calculation, payments })).digest("hex"),
  };
}

export type EventAccountView = Awaited<ReturnType<typeof loadAccount>>;

export async function getEventAccount(userId: string, communityId: string, eventId: string) {
  return prisma.$transaction((tx) => loadAccount(tx, userId, communityId, eventId), {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

export async function changeEventAccount(
  userId: string,
  communityId: string,
  eventId: string,
  rawInput: EventAccountAction,
) {
  const parsed = eventAccountActionSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const input = parsed.data;
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Serialize payments and closing; concurrent changes return a retryable conflict.
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid AND "communityId" = ${communityId}::uuid FOR UPDATE`;
        const account = await loadAccount(tx, userId, communityId, eventId);
        if (!account.canManage)
          throw new AppError(
            "Apenas o criador do evento ou administradores podem gerenciar pagamentos.",
            403,
            "FORBIDDEN",
          );
        if (input.action === "ENABLE") {
          await tx.event.update({ where: { id: eventId }, data: { paymentTrackingEnabled: true } });
          return;
        }
        if (!account.enabled)
          throw new AppError(
            "Habilite o controle de pagamentos primeiro.",
            409,
            "ACCOUNT_DISABLED",
          );
        if (input.action === "REOPEN") {
          await tx.event.update({
            where: { id: eventId },
            data: { accountClosedAt: null, accountSnapshot: Prisma.DbNull },
          });
          return;
        }
        if (account.closedAt)
          throw new AppError("Reabra a conta antes de alterá-la.", 409, "ACCOUNT_CLOSED");
        if (input.action === "DISABLE") {
          if (account.payments.length)
            throw new AppError(
              "Contas com histórico de pagamentos não podem ser desabilitadas. Feche a conta para preservar o histórico.",
              409,
              "ACCOUNT_HAS_PAYMENTS",
            );
          await tx.event.update({
            where: { id: eventId },
            data: { paymentTrackingEnabled: false },
          });
          return;
        }
        if (input.action === "VOID") {
          const payment = assertFound(
            account.payments.find((item) => item.id === input.paymentId),
            "Pagamento não encontrado.",
          );
          if (!payment.voidedAt)
            await tx.eventPayment.update({
              where: { id: payment.id },
              data: { voidedAt: new Date(), voidedById: userId },
            });
          return;
        }
        if (account.issues.length)
          throw new AppError(account.issues.join(" "), 409, "ACCOUNT_INVALID");
        if (account.revision !== input.revision)
          throw new AppError(
            "Os valores mudaram. Atualize a página e confira o saldo antes de continuar.",
            409,
            "ACCOUNT_CHANGED",
          );
        const summary = account.summary!;
        if (input.action === "CLOSE") {
          if (!summary.people.length || summary.people.some((person) => person.dueCents !== 0)) {
            throw new AppError(
              "Quite todos os pagamentos e reembolsos antes de fechar a conta.",
              409,
              "ACCOUNT_PENDING",
            );
          }
          await tx.event.update({
            where: { id: eventId },
            data: { accountClosedAt: new Date(), accountSnapshot: summary },
          });
          return;
        }
        const person = assertFound(
          summary.people.find((item) => item.id === input.userId),
          "Pessoa não encontrada na conta do evento.",
        );
        if (
          input.direction === "REFUNDED" &&
          (person.dueCents >= 0 || input.amountCents > Math.abs(person.dueCents))
        ) {
          throw new AppError(
            "Reembolsos só podem abater um crédito existente e não podem ultrapassá-lo.",
            409,
            "INVALID_PAYMENT",
          );
        }
        await tx.eventPayment.create({
          data: {
            eventId,
            userId: input.userId,
            recordedById: userId,
            amountCents: BigInt(input.amountCents),
            direction: input.direction,
            note: input.note || null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError(
        "Outra alteração ocorreu ao mesmo tempo. Atualize a página e tente novamente.",
        409,
        "ACCOUNT_CHANGED",
      );
    }
    throw error;
  }
}
