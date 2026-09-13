import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { challengeState } from "@/lib/challenges";
import { civilDateInTimeZone, formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import {
  challengeConfigurationSchema,
  challengePageSchema,
  challengeSchema,
  type ChallengeAction,
  type ChallengeInput,
} from "@/lib/validation/challenge";
import { AppError, assertFound } from "@/server/errors";

const PAGE_SIZE = 20;
async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true, displayName: true, user: { select: { name: true } } },
    }),
    "Você não participa desta comunidade.",
  );
}

function canManage(userId: string, role: string, createdById: string) {
  return userId === createdById || role === "OWNER" || role === "ADMIN";
}

// Serialize rule changes with enrollment/cancellation; retry database serialization conflicts.
async function transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
        throw error;
      if (attempt === 2)
        throw new AppError(
          "O desafio mudou. Atualize a página e tente novamente.",
          409,
          "CONFLICT",
        );
    }
  }
  throw new Error("Unreachable transaction retry");
}

function validatedData(value: ChallengeInput) {
  const parsed = challengeSchema.safeParse(value);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const input = parsed.data;
  if (input.startDate < civilDateInTimeZone(new Date(), input.timezone)) {
    throw new AppError("O desafio deve começar hoje ou em uma data futura.");
  }
  return {
    ...input,
    description: input.description || null,
    startDate: parseCivilDate(input.startDate),
    endDate: parseCivilDate(input.endDate),
  };
}

export async function createChallenge(userId: string, communityId: string, input: ChallengeInput) {
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    return db.challenge.create({
      data: { ...validatedData(input), communityId, createdById: userId },
      select: { id: true },
    });
  });
}

function summaryInclude(userId: string) {
  return {
    createdBy: { select: { name: true } },
    participants: { where: { userId, leftAt: null }, select: { userId: true } },
    _count: { select: { participants: { where: { leftAt: null } } } },
  } satisfies Prisma.ChallengeInclude;
}
type Summary = Prisma.ChallengeGetPayload<{ include: ReturnType<typeof summaryInclude> }>;
function serialize(challenge: Summary, userId: string, role: string) {
  const state = challengeState(challenge);
  const manager = canManage(userId, role, challenge.createdById);
  return {
    id: challenge.id,
    title: challenge.title,
    description: challenge.description,
    rules: challenge.rules,
    startDate: formatCivilDate(challenge.startDate),
    endDate: formatCivilDate(challenge.endDate),
    timezone: challenge.timezone,
    configuration: challengeConfigurationSchema.parse(challenge.configuration),
    createdByName: challenge.createdBy.name,
    state,
    participantCount: challenge._count.participants,
    joined: challenge.participants.length > 0,
    canParticipate: state === "SCHEDULED" || state === "ACTIVE",
    canEdit: manager && state === "SCHEDULED" && !challenge.firstJoinedAt,
    canCancel: manager && (state === "SCHEDULED" || state === "ACTIVE"),
    canModerate: manager && (state === "ACTIVE" || state === "ENDED") && !challenge.finalizedAt,
    canFinalize: manager && state === "ENDED" && !challenge.finalizedAt,
    finalizedAt: challenge.finalizedAt?.toISOString() ?? null,
    finalizedByName: challenge.finalizedByName,
  };
}

export async function listChallenges(userId: string, communityId: string, requestedPage = 1) {
  const member = await membership(prisma, userId, communityId);
  const page = challengePageSchema.parse(requestedPage);
  const rows = await prisma.challenge.findMany({
    where: { communityId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    include: summaryInclude(userId),
  });
  return {
    items: rows.slice(0, PAGE_SIZE).map((row) => serialize(row, userId, member.role)),
    hasNext: rows.length > PAGE_SIZE,
  };
}

export async function getChallenge(
  userId: string,
  communityId: string,
  challengeId: string,
  requestedPage = 1,
) {
  const member = await membership(prisma, userId, communityId);
  const challenge = assertFound(
    await prisma.challenge.findFirst({
      where: { id: challengeId, communityId },
      include: summaryInclude(userId),
    }),
    "Desafio não encontrado.",
  );
  const page = challengePageSchema.parse(requestedPage);
  const participants = await prisma.challengeParticipant.findMany({
    where: { challengeId, communityId, leftAt: null },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      userId: true,
      member: { select: { displayName: true, user: { select: { name: true, avatarUrl: true } } } },
    },
  });
  return {
    ...serialize(challenge, userId, member.role),
    participants: participants.slice(0, PAGE_SIZE).map(({ userId: id, member: person }) => ({
      id,
      name: person.displayName || person.user.name,
      avatarUrl: person.user.avatarUrl,
    })),
    hasNextParticipants: participants.length > PAGE_SIZE,
  };
}

export async function updateChallenge(
  userId: string,
  communityId: string,
  challengeId: string,
  input: ChallengeInput,
) {
  return transaction(async (db) => {
    const member = await membership(db, userId, communityId);
    const challenge = assertFound(
      await db.challenge.findFirst({ where: { id: challengeId, communityId } }),
      "Desafio não encontrado.",
    );
    if (!canManage(userId, member.role, challenge.createdById))
      throw new AppError("Só o criador e administradores podem editar.", 403);
    if (challenge.firstJoinedAt || challengeState(challenge) !== "SCHEDULED") {
      throw new AppError(
        "As regras ficam bloqueadas após a primeira inscrição ou o início. Crie outro desafio para mudar o combinado.",
        409,
      );
    }
    return db.challenge.update({
      where: { id: challengeId },
      data: validatedData(input),
      select: { id: true },
    });
  });
}

export async function changeChallengeParticipation(
  userId: string,
  communityId: string,
  challengeId: string,
  action: ChallengeAction,
) {
  return transaction(async (db) => {
    const member = await membership(db, userId, communityId);
    const challenge = assertFound(
      await db.challenge.findFirst({ where: { id: challengeId, communityId } }),
      "Desafio não encontrado.",
    );
    if (action === "CANCEL" && !canManage(userId, member.role, challenge.createdById)) {
      throw new AppError("Só o criador e administradores podem cancelar.", 403);
    }
    const state = challengeState(challenge);
    if (action === "CANCEL" && state === "CANCELLED") return { id: challengeId };
    if (state === "CANCELLED" || state === "ENDED")
      throw new AppError("Este desafio não aceita mais alterações.", 409);
    const now = new Date();
    // The common parent write also serializes simultaneous joins and leave/cancel operations.
    await db.challenge.update({
      where: { id: challengeId },
      data: {
        updatedAt: now,
        ...(action === "JOIN" && !challenge.firstJoinedAt ? { firstJoinedAt: now } : {}),
        ...(action === "CANCEL" ? { cancelledAt: now } : {}),
      },
    });
    if (action === "JOIN")
      await db.challengeParticipant.upsert({
        where: { challengeId_userId: { challengeId, userId } },
        create: { challengeId, communityId, userId },
        update: { leftAt: null },
      });
    if (action === "LEAVE")
      await db.challengeParticipant.updateMany({
        where: { challengeId, communityId, userId, leftAt: null },
        data: { leftAt: now },
      });
    return { id: challengeId };
  });
}

export type ChallengeDetail = Awaited<ReturnType<typeof getChallenge>>;

export {
  membership as requireChallengeMembership,
  transaction as challengeTransaction,
  canManage as canManageChallenge,
};
