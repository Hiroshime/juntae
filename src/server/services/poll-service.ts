import { Prisma, type CommunityRole, type PollStatus } from "@prisma/client";
import { formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import type { CreatePollInput, UpdatePollInput } from "@/lib/validation/poll";
import {
  assertPollAcceptsVotes,
  effectivePollStatus,
  summarizePollResults,
  validateVoteSelection,
} from "@/server/domain/polls";
import { AppError, assertFound } from "@/server/errors";
import { getCommunityCalendar } from "@/server/services/availability-service";

const pollListSelection = {
  id: true,
  communityId: true,
  createdById: true,
  title: true,
  description: true,
  type: true,
  allowVoteChange: true,
  closesAt: true,
  status: true,
  createdAt: true,
  createdBy: { select: { name: true, avatarUrl: true } },
  options: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      label: true,
      dateValue: true,
      votes: { select: { userId: true } },
    },
  },
} satisfies Prisma.PollSelect;

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function canManagePoll(actorId: string, role: CommunityRole, poll: { createdById: string }) {
  return poll.createdById === actorId || role === "OWNER" || role === "ADMIN";
}

function assertCanManagePoll(actorId: string, role: CommunityRole, poll: { createdById: string }) {
  if (!canManagePoll(actorId, role, poll)) {
    throw new AppError(
      "Apenas o criador ou um administrador pode alterar esta votação.",
      403,
      "FORBIDDEN",
    );
  }
}

function optionData(input: CreatePollInput) {
  if (input.type === "DATE_OPTIONS") {
    return input.dates
      .slice()
      .sort()
      .map((date, sortOrder) => ({
        label: new Intl.DateTimeFormat("pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(parseCivilDate(date)),
        dateValue: parseCivilDate(date),
        sortOrder,
      }));
  }
  return input.options.map((label, sortOrder) => ({ label, sortOrder }));
}

type PollListRecord = Prisma.PollGetPayload<{ select: typeof pollListSelection }>;

function toPollSummary(poll: PollListRecord, userId: string) {
  const result = summarizePollResults(poll.options);
  return {
    id: poll.id,
    communityId: poll.communityId,
    createdById: poll.createdById,
    title: poll.title,
    description: poll.description,
    type: poll.type,
    allowVoteChange: poll.allowVoteChange,
    closesAt: poll.closesAt,
    status: effectivePollStatus(poll.status, poll.closesAt),
    createdAt: poll.createdAt,
    createdBy: poll.createdBy,
    totalVoters: result.totalVoters,
    optionCount: poll.options.length,
    myVoteCount: poll.options.reduce(
      (count, option) => count + option.votes.filter((vote) => vote.userId === userId).length,
      0,
    ),
    leadingOption:
      poll.options
        .map((option) => ({ label: option.label, votes: option.votes.length }))
        .sort((first, second) => second.votes - first.votes)[0] ?? null,
  };
}

export async function createPoll(userId: string, communityId: string, input: CreatePollInput) {
  await requireMembership(userId, communityId);
  return prisma.poll.create({
    data: {
      communityId,
      createdById: userId,
      title: input.title,
      description: input.description,
      type: input.type,
      allowVoteChange: input.allowVoteChange,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      status: "OPEN",
      options: { create: optionData(input) },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function listPolls(
  userId: string,
  communityId: string,
  options: { scope: "OPEN" | "CLOSED" | "ALL"; take: number; skip?: number },
) {
  await requireMembership(userId, communityId);
  const now = new Date();
  const polls = await prisma.poll.findMany({
    where: {
      communityId,
      ...(options.scope === "OPEN"
        ? {
            status: "OPEN" as PollStatus,
            OR: [{ closesAt: null }, { closesAt: { gt: now } }],
          }
        : options.scope === "CLOSED"
          ? {
              OR: [{ status: "CLOSED" as PollStatus }, { closesAt: { lte: now } }],
            }
          : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    skip: options.skip,
    take: options.take,
    select: pollListSelection,
  });
  return polls.map((poll) => toPollSummary(poll, userId));
}

export async function getPoll(userId: string, communityId: string, pollId: string) {
  const membership = await requireMembership(userId, communityId);
  const poll = assertFound(
    await prisma.poll.findFirst({
      where: { id: pollId, communityId },
      include: {
        createdBy: { select: { name: true, avatarUrl: true } },
        options: {
          orderBy: { sortOrder: "asc" },
          include: {
            votes: {
              orderBy: { createdAt: "asc" },
              include: {
                user: {
                  select: {
                    name: true,
                    avatarUrl: true,
                    memberships: {
                      where: { communityId },
                      select: { displayName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    "Votação não encontrada.",
  );
  const summary = summarizePollResults(poll.options);
  const availabilityByDate = new Map<
    string,
    { fullAvailableCount: number; unknownCount: number; score: number; totalMembers: number }
  >();
  const pollDates = poll.options
    .flatMap((option) => (option.dateValue ? [formatCivilDate(option.dateValue)] : []))
    .sort();
  if (poll.type === "DATE_OPTIONS" && pollDates.length) {
    const calendar = await getCommunityCalendar(userId, communityId, {
      startDate: pollDates[0],
      endDate: pollDates.at(-1)!,
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL",
    });
    for (const day of calendar.days) availabilityByDate.set(day.date, day.summary);
  }
  const myOptionIds = poll.options
    .filter((option) => option.votes.some((vote) => vote.userId === userId))
    .map((option) => option.id);
  const status = effectivePollStatus(poll.status, poll.closesAt);
  return {
    id: poll.id,
    communityId: poll.communityId,
    createdById: poll.createdById,
    title: poll.title,
    description: poll.description,
    type: poll.type,
    allowVoteChange: poll.allowVoteChange,
    closesAt: poll.closesAt,
    status,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
    createdBy: poll.createdBy,
    canManage: canManagePoll(userId, membership.role, poll),
    canVote: status === "OPEN" && (poll.allowVoteChange || myOptionIds.length === 0),
    myOptionIds,
    totalVoters: summary.totalVoters,
    options: poll.options.map((option) => {
      const optionSummary = summary.options.find((item) => item.optionId === option.id)!;
      const date = option.dateValue ? formatCivilDate(option.dateValue) : null;
      return {
        id: option.id,
        label: option.label,
        sortOrder: option.sortOrder,
        dateValue: date,
        voteCount: optionSummary.voteCount,
        percentage: optionSummary.percentage,
        availability: date ? (availabilityByDate.get(date) ?? null) : null,
        voters: option.votes.map((vote) => ({
          userId: vote.userId,
          name: vote.user.memberships[0]?.displayName || vote.user.name,
          avatarUrl: vote.user.avatarUrl,
        })),
      };
    }),
  };
}

async function requireManageablePoll(userId: string, communityId: string, pollId: string) {
  const membership = await requireMembership(userId, communityId);
  const poll = assertFound(
    await prisma.poll.findFirst({ where: { id: pollId, communityId } }),
    "Votação não encontrada.",
  );
  assertCanManagePoll(userId, membership.role, poll);
  return poll;
}

export async function updatePoll(
  userId: string,
  communityId: string,
  pollId: string,
  input: UpdatePollInput,
) {
  const poll = await requireManageablePoll(userId, communityId, pollId);
  if (effectivePollStatus(poll.status, poll.closesAt) === "CLOSED") {
    throw new AppError("Votações encerradas não podem ser editadas.", 409, "POLL_CLOSED");
  }
  return prisma.poll.update({
    where: { id: pollId },
    data: {
      title: input.title,
      description: input.description,
      allowVoteChange: input.allowVoteChange,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    },
  });
}

export async function closePoll(userId: string, communityId: string, pollId: string) {
  const poll = await requireManageablePoll(userId, communityId, pollId);
  if (poll.status === "CLOSED") return poll;
  return prisma.poll.update({ where: { id: pollId }, data: { status: "CLOSED" } });
}

function pollClosedError() {
  return new AppError("Esta votação foi encerrada.", 409, "POLL_CLOSED");
}

export async function castVote(
  userId: string,
  communityId: string,
  pollId: string,
  optionIds: string[],
) {
  return prisma.$transaction(
    async (tx) => {
      const membership = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: { userId: true },
      });
      if (!membership) throw new AppError("Você não participa desta comunidade.", 404, "NOT_FOUND");
      const poll = assertFound(
        await tx.poll.findFirst({
          where: { id: pollId, communityId },
          include: {
            options: { select: { id: true } },
            votes: { where: { userId }, select: { optionId: true } },
          },
        }),
        "Votação não encontrada.",
      );
      try {
        assertPollAcceptsVotes(poll);
        validateVoteSelection(poll.type, optionIds);
      } catch (error) {
        if (error instanceof Error && error.message === "POLL_CLOSED") throw pollClosedError();
        throw new AppError("Selecione uma opção válida.", 400, "INVALID_VOTE_SELECTION");
      }
      const validOptionIds = new Set(poll.options.map((option) => option.id));
      if (optionIds.some((optionId) => !validOptionIds.has(optionId))) {
        throw new AppError(
          "Uma opção selecionada não pertence a esta votação.",
          400,
          "INVALID_OPTION",
        );
      }
      const previousIds = poll.votes.map((vote) => vote.optionId).sort();
      const nextIds = [...optionIds].sort();
      const sameSelection =
        previousIds.length === nextIds.length &&
        previousIds.every((optionId, index) => optionId === nextIds[index]);
      if (poll.votes.length && !poll.allowVoteChange) {
        if (sameSelection) return { optionIds: previousIds };
        throw new AppError(
          "Esta votação não permite alterar o voto.",
          409,
          "VOTE_CHANGE_NOT_ALLOWED",
        );
      }
      await tx.pollVote.deleteMany({ where: { pollId, userId } });
      await tx.pollVote.createMany({
        data: optionIds.map((optionId) => ({ pollId, optionId, userId })),
      });
      return { optionIds };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeVote(userId: string, communityId: string, pollId: string) {
  return prisma.$transaction(async (tx) => {
    const membership = await tx.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { userId: true },
    });
    if (!membership) throw new AppError("Você não participa desta comunidade.", 404, "NOT_FOUND");
    const poll = assertFound(
      await tx.poll.findFirst({ where: { id: pollId, communityId } }),
      "Votação não encontrada.",
    );
    try {
      assertPollAcceptsVotes(poll);
    } catch {
      throw pollClosedError();
    }
    const voteCount = await tx.pollVote.count({ where: { pollId, userId } });
    if (voteCount && !poll.allowVoteChange) {
      throw new AppError(
        "Esta votação não permite remover o voto.",
        409,
        "VOTE_CHANGE_NOT_ALLOWED",
      );
    }
    return tx.pollVote.deleteMany({ where: { pollId, userId } });
  });
}
