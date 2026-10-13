import { Prisma, type CommunityRole } from "@prisma/client";
import { civilDateInTimeZone, formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import type {
  CommunityFundDepositInput,
  CommunityFundEntryAction,
  CommunityFundSettingsInput,
  CommunityFundUsageInput,
} from "@/lib/validation/community-fund";
import { AppError, assertFound } from "@/server/errors";
import { loadEventAccount } from "@/server/services/event-account-service";

function isAdmin(role: CommunityRole) {
  return role === "OWNER" || role === "ADMIN";
}

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function cents(value: bigint | null | undefined) {
  const result = Number(value ?? BigInt(0));
  if (!Number.isSafeInteger(result)) throw new AppError("O saldo excedeu o limite suportado.", 500);
  return result;
}

function memberName(member: { displayName: string | null; user: { name: string } }) {
  return member.displayName || member.user.name;
}

const entryInclude = {
  user: {
    select: {
      name: true,
      avatarUrl: true,
      memberships: { select: { communityId: true, displayName: true } },
    },
  },
  submittedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  event: { select: { id: true, title: true } },
} satisfies Prisma.CommunityFundEntryInclude;

function serializeEntry(
  entry: Prisma.CommunityFundEntryGetPayload<{ include: typeof entryInclude }>,
  communityId: string,
) {
  return {
    id: entry.id,
    userId: entry.userId,
    userName:
      entry.user.memberships.find((membership) => membership.communityId === communityId)
        ?.displayName || entry.user.name,
    avatarUrl: entry.user.avatarUrl,
    submittedBy: entry.submittedBy.name,
    reviewedBy: entry.reviewedBy?.name ?? null,
    event: entry.event,
    type: entry.type,
    status: entry.status,
    amountCents: cents(entry.amountCents),
    referenceMonth: entry.referenceMonth ? formatCivilDate(entry.referenceMonth).slice(0, 7) : null,
    effectiveDate: formatCivilDate(entry.effectiveDate),
    note: entry.note,
    reviewNote: entry.reviewNote,
    reviewedAt: entry.reviewedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function getCommunityFund(userId: string, communityId: string) {
  const membership = await requireMembership(userId, communityId);
  const manageable = isAdmin(membership.role);
  const currentMonth = civilDateInTimeZone(new Date(), "America/Sao_Paulo").slice(0, 7);
  const currentMonthDate = parseCivilDate(`${currentMonth}-01`);
  const [settings, grouped, monthGrouped, entries, members, events, ownPending] = await Promise.all(
    [
      prisma.communityFundSettings.findUnique({ where: { communityId } }),
      prisma.communityFundEntry.groupBy({
        by: ["userId", "type"],
        where: { communityId, status: "APPROVED" },
        _sum: { amountCents: true },
      }),
      prisma.communityFundEntry.groupBy({
        by: ["userId"],
        where: {
          communityId,
          type: "DEPOSIT",
          status: "APPROVED",
          referenceMonth: currentMonthDate,
        },
        _sum: { amountCents: true },
      }),
      prisma.communityFundEntry.findMany({
        where: { communityId, ...(manageable ? {} : { userId }) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 100,
        include: entryInclude,
      }),
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
        where: {
          communityId,
          status: { not: "CANCELLED" },
          currency: "BRL",
          paymentTrackingEnabled: true,
          accountClosedAt: null,
        },
        orderBy: { startsAt: "desc" },
        take: 100,
        select: { id: true, title: true, startsAt: true },
      }),
      prisma.communityFundEntry.aggregate({
        where: { communityId, userId, type: "DEPOSIT", status: "PENDING" },
        _sum: { amountCents: true },
      }),
    ],
  );

  const balances = new Map<string, number>();
  for (const row of grouped) {
    const amount = cents(row._sum.amountCents);
    balances.set(
      row.userId,
      (balances.get(row.userId) ?? 0) + (row.type === "DEPOSIT" ? amount : -amount),
    );
  }
  const monthAmounts = new Map(
    monthGrouped.map((row) => [row.userId, cents(row._sum.amountCents)]),
  );
  const totalCents = [...balances.values()].reduce((total, value) => total + value, 0);

  return {
    canManage: manageable,
    currentMonth,
    totalCents,
    myBalanceCents: balances.get(userId) ?? 0,
    myPendingCents: cents(ownPending._sum.amountCents),
    settings: {
      monthlyContributionCents: settings ? cents(settings.monthlyContributionCents) || null : null,
      pixKey: settings?.pixKey ?? null,
      pixRecipientName: settings?.pixRecipientName ?? null,
      pixCopyPaste: settings?.pixCopyPaste ?? null,
      hasQrCode: Boolean(settings?.qrCodeData),
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    },
    members: manageable
      ? members.map((member) => ({
          id: member.userId,
          name: memberName(member),
          avatarUrl: member.user.avatarUrl,
          balanceCents: balances.get(member.userId) ?? 0,
          monthDepositCents: monthAmounts.get(member.userId) ?? 0,
        }))
      : [],
    events: manageable
      ? events.map((event) => ({ ...event, startsAt: event.startsAt.toISOString() }))
      : [],
    entries: entries.map((entry) => ({
      ...serializeEntry(entry, communityId),
      isMine: entry.userId === userId,
    })),
  };
}

export async function updateCommunityFundSettings(
  userId: string,
  communityId: string,
  input: CommunityFundSettingsInput,
) {
  const membership = await requireMembership(userId, communityId);
  if (!isAdmin(membership.role))
    throw new AppError("Apenas administradores configuram o Fundão.", 403, "FORBIDDEN");
  return prisma.communityFundSettings.upsert({
    where: { communityId },
    create: {
      communityId,
      monthlyContributionCents:
        input.monthlyContributionCents == null ? null : BigInt(input.monthlyContributionCents),
      pixKey: input.pixKey,
      pixRecipientName: input.pixRecipientName,
      pixCopyPaste: input.pixCopyPaste,
      updatedById: userId,
    },
    update: {
      monthlyContributionCents:
        input.monthlyContributionCents == null ? null : BigInt(input.monthlyContributionCents),
      pixKey: input.pixKey,
      pixRecipientName: input.pixRecipientName,
      pixCopyPaste: input.pixCopyPaste,
      updatedById: userId,
    },
  });
}

export async function submitCommunityFundDeposit(
  userId: string,
  communityId: string,
  input: CommunityFundDepositInput,
) {
  await requireMembership(userId, communityId);
  return prisma.communityFundEntry.create({
    data: {
      communityId,
      userId,
      submittedById: userId,
      type: "DEPOSIT",
      status: "PENDING",
      amountCents: BigInt(input.amountCents),
      referenceMonth: parseCivilDate(`${input.referenceMonth}-01`),
      effectiveDate: parseCivilDate(input.effectiveDate),
      note: input.note || null,
    },
  });
}

type FundTransaction = Prisma.TransactionClient;

async function approvedBalance(tx: FundTransaction, communityId: string, userId: string) {
  const rows = await tx.communityFundEntry.groupBy({
    by: ["type"],
    where: { communityId, userId, status: "APPROVED" },
    _sum: { amountCents: true },
  });
  return rows.reduce((balance, row) => {
    const amount = cents(row._sum.amountCents);
    return balance + (row.type === "DEPOSIT" ? amount : -amount);
  }, 0);
}

async function lockCommunity(tx: FundTransaction, communityId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Community" WHERE "id" = ${communityId}::uuid FOR UPDATE
  `;
  if (!rows.length) throw new AppError("Comunidade não encontrada.", 404, "NOT_FOUND");
}

export async function createCommunityFundUsage(
  userId: string,
  communityId: string,
  input: CommunityFundUsageInput,
) {
  const membership = await requireMembership(userId, communityId);
  if (!isAdmin(membership.role))
    throw new AppError("Apenas administradores podem usar saldos.", 403, "FORBIDDEN");
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockCommunity(tx, communityId);
        const target = await tx.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: input.userId } },
          select: { userId: true },
        });
        if (!target) throw new AppError("Membro não encontrado nesta comunidade.");
        if (input.eventId) {
          const events = await tx.$queryRaw<
            Array<{
              id: string;
              currency: string;
              paymentTrackingEnabled: boolean;
              accountClosedAt: Date | null;
            }>
          >`
            SELECT "id", "currency", "paymentTrackingEnabled", "accountClosedAt"
            FROM "Event"
            WHERE "id" = ${input.eventId}::uuid AND "communityId" = ${communityId}::uuid
            FOR UPDATE
          `;
          const event = events[0];
          if (!event) throw new AppError("Evento não encontrado nesta comunidade.");
          if (event.currency !== "BRL")
            throw new AppError(
              "O Fundão em reais só pode ser aplicado a eventos em BRL.",
              409,
              "FUND_CURRENCY_MISMATCH",
            );
          if (!event.paymentTrackingEnabled)
            throw new AppError(
              "Habilite o controle de pagamentos do evento antes de usar o Fundão.",
              409,
              "EVENT_ACCOUNT_DISABLED",
            );
          if (event.accountClosedAt)
            throw new AppError(
              "Reabra a conta do evento antes de alterar créditos do Fundão.",
              409,
              "ACCOUNT_CLOSED",
            );
          const account = await loadEventAccount(tx, userId, communityId, input.eventId);
          if (account.issues.length)
            throw new AppError(account.issues.join(" "), 409, "ACCOUNT_INVALID");
          const person = account.summary?.people.find((item) => item.id === input.userId);
          if (!person || person.dueCents <= 0)
            throw new AppError(
              "A conta deste membro já está quitada ou possui crédito a favor. O Fundão só pode abater valores ainda pendentes.",
              409,
              "NO_EVENT_BALANCE_DUE",
            );
          if (input.amountCents > person.dueCents)
            throw new AppError(
              "O crédito do Fundão não pode ultrapassar o valor pendente no evento.",
              409,
              "FUND_CREDIT_EXCEEDS_EVENT_DUE",
            );
        }
        const balance = await approvedBalance(tx, communityId, input.userId);
        if (input.amountCents > balance)
          throw new AppError(
            "O uso não pode ultrapassar o saldo disponível.",
            409,
            "INSUFFICIENT_FUND_BALANCE",
          );
        return tx.communityFundEntry.create({
          data: {
            communityId,
            userId: input.userId,
            submittedById: userId,
            reviewedById: userId,
            eventId: input.eventId,
            type: "USAGE",
            status: "APPROVED",
            amountCents: BigInt(input.amountCents),
            effectiveDate: parseCivilDate(input.effectiveDate),
            note: input.note,
            reviewedAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw new AppError("O saldo mudou. Atualize e tente novamente.", 409, "FUND_CHANGED");
    throw error;
  }
}

export async function changeCommunityFundEntry(
  userId: string,
  communityId: string,
  entryId: string,
  input: CommunityFundEntryAction,
) {
  const membership = await requireMembership(userId, communityId);
  try {
    return await prisma.$transaction(
      async (tx) => {
        await lockCommunity(tx, communityId);
        const entry = assertFound(
          await tx.communityFundEntry.findFirst({ where: { id: entryId, communityId } }),
          "Lançamento não encontrado.",
        );
        if (input.action === "CANCEL") {
          if (entry.userId !== userId || entry.type !== "DEPOSIT")
            throw new AppError("Você não pode cancelar este lançamento.", 403, "FORBIDDEN");
          if (entry.status !== "PENDING")
            throw new AppError(
              "Somente depósitos pendentes podem ser cancelados.",
              409,
              "INVALID_FUND_STATUS",
            );
          return tx.communityFundEntry.update({
            where: { id: entry.id },
            data: {
              status: "VOIDED",
              reviewedById: userId,
              reviewedAt: new Date(),
              reviewNote: "Cancelado pelo membro.",
            },
          });
        }
        if (!isAdmin(membership.role))
          throw new AppError("Apenas administradores podem revisar lançamentos.", 403, "FORBIDDEN");
        if (input.action === "APPROVE" || input.action === "REJECT") {
          if (entry.type !== "DEPOSIT" || entry.status !== "PENDING")
            throw new AppError("Este depósito já foi revisado.", 409, "INVALID_FUND_STATUS");
          return tx.communityFundEntry.update({
            where: { id: entry.id },
            data: {
              status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
              reviewedById: userId,
              reviewedAt: new Date(),
              reviewNote: input.action === "REJECT" ? input.note : null,
            },
          });
        }
        if (entry.status !== "APPROVED")
          throw new AppError(
            "Somente lançamentos aprovados podem ser anulados.",
            409,
            "INVALID_FUND_STATUS",
          );
        if (entry.type === "USAGE" && entry.eventId) {
          const events = await tx.$queryRaw<Array<{ accountClosedAt: Date | null }>>`
            SELECT "accountClosedAt"
            FROM "Event"
            WHERE "id" = ${entry.eventId}::uuid AND "communityId" = ${communityId}::uuid
            FOR UPDATE
          `;
          if (events[0]?.accountClosedAt)
            throw new AppError(
              "Reabra a conta do evento antes de anular este crédito.",
              409,
              "ACCOUNT_CLOSED",
            );
        }
        if (entry.type === "DEPOSIT") {
          const balance = await approvedBalance(tx, communityId, entry.userId);
          if (balance - cents(entry.amountCents) < 0)
            throw new AppError(
              "Este depósito já sustenta um uso de saldo e não pode ser anulado.",
              409,
              "INSUFFICIENT_FUND_BALANCE",
            );
        }
        return tx.communityFundEntry.update({
          where: { id: entry.id },
          data: {
            status: "VOIDED",
            reviewedById: userId,
            reviewedAt: new Date(),
            reviewNote: input.note,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
      throw new AppError("O saldo mudou. Atualize e tente novamente.", 409, "FUND_CHANGED");
    throw error;
  }
}

export async function saveCommunityFundQrCode(
  userId: string,
  communityId: string,
  qrCode: { data: Uint8Array<ArrayBuffer>; contentType: string },
) {
  const membership = await requireMembership(userId, communityId);
  if (!isAdmin(membership.role))
    throw new AppError("Apenas administradores configuram o QR Code.", 403, "FORBIDDEN");
  await prisma.communityFundSettings.upsert({
    where: { communityId },
    create: {
      communityId,
      qrCodeData: qrCode.data,
      qrCodeContentType: qrCode.contentType,
      updatedById: userId,
    },
    update: { qrCodeData: qrCode.data, qrCodeContentType: qrCode.contentType, updatedById: userId },
  });
}

export async function deleteCommunityFundQrCode(userId: string, communityId: string) {
  const membership = await requireMembership(userId, communityId);
  if (!isAdmin(membership.role))
    throw new AppError("Apenas administradores configuram o QR Code.", 403, "FORBIDDEN");
  await prisma.communityFundSettings.updateMany({
    where: { communityId },
    data: { qrCodeData: null, qrCodeContentType: null, updatedById: userId },
  });
}

export async function getCommunityFundQrCode(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  return assertFound(
    await prisma.communityFundSettings.findFirst({
      where: { communityId, qrCodeData: { not: null } },
      select: { qrCodeData: true, qrCodeContentType: true, updatedAt: true },
    }),
    "QR Code não encontrado.",
  );
}
