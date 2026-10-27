import { randomUUID } from "node:crypto";
import { Prisma, type CommunityRole, type PollStatus } from "@prisma/client";
import {
  civilDateInTimeZone,
  daysBetweenCivilDates,
  formatCivilDate,
  parseCivilDate,
} from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import {
  MAX_POLL_ALBUM_BYTES,
  MAX_POLL_OPTION_IMAGES,
  type PollImageUpload,
} from "@/lib/polls/images";
import {
  parsePollOptionMetadata,
  type CreatePollInput,
  type ReopenPollInput,
  type UpdatePollInput,
  type AddPollOptionInput,
} from "@/lib/validation/poll";
import {
  assertPollAcceptsVotes,
  calculatePollReopenDeadline,
  effectivePollStatus,
  pollReopenState,
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
  allowMemberOptions: true,
  questions: { select: { id: true } },
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

function optionData(input: CreatePollInput, imageUploads: PollImageUpload[]) {
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
  const choices =
    input.type === "GROUPED"
      ? input.questions.flatMap((question) => question.options)
      : input.options;
  return choices.map((option, sortOrder) => {
    const metadata: Record<string, string> = {};
    if (option.description) metadata.description = option.description;
    if (option.imageUrl) metadata.imageUrl = option.imageUrl;
    if (option.websiteUrl) metadata.websiteUrl = option.websiteUrl;
    if (option.location) metadata.location = option.location;
    return {
      label: option.label,
      sortOrder,
      ...(Object.keys(metadata).length ? { metadata } : {}),
      images: {
        create: imageUploads
          .filter((image) => image.optionIndex === sortOrder)
          .map((image) => ({
            data: image.data,
            contentType: image.contentType,
            originalName: image.originalName,
            sizeBytes: image.sizeBytes,
            sortOrder: image.sortOrder,
          })),
      },
    };
  });
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
    allowMemberOptions: poll.allowMemberOptions,
    questionCount: poll.questions.length,
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
      poll.type === "GROUPED"
        ? null
        : (poll.options
            .map((option) => ({ label: option.label, votes: option.votes.length }))
            .sort((first, second) => second.votes - first.votes)[0] ?? null),
  };
}

export async function createPoll(
  userId: string,
  communityId: string,
  input: CreatePollInput,
  imageUploads: PollImageUpload[] = [],
) {
  await requireMembership(userId, communityId);
  if (input.type === "DATE_OPTIONS" && imageUploads.length) {
    throw new AppError(
      "Votações de data não aceitam álbuns nas opções.",
      400,
      "POLL_IMAGES_NOT_ALLOWED",
    );
  }
  const data = {
    communityId,
    createdById: userId,
    title: input.title,
    description: input.description,
    type: input.type,
    allowVoteChange: input.allowVoteChange,
    allowMemberOptions: input.allowMemberOptions ?? false,
    timezone: input.type === "DATE_OPTIONS" ? input.timezone : "America/Sao_Paulo",
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
    status: "OPEN" as const,
  };
  if (input.type === "GROUPED") {
    const questions = input.questions.map((question, sortOrder) => ({
      id: randomUUID(),
      title: question.title,
      type: question.type,
      sortOrder,
    }));
    const choices = optionData(input, imageUploads);
    return prisma.$transaction(async (tx) => {
      const poll = await tx.poll.create({ data: { ...data, questions: { create: questions } } });
      let offset = 0;
      for (const [index, question] of input.questions.entries()) {
        for (const option of choices.slice(offset, offset + question.options.length)) {
          await tx.pollOption.create({
            data: { ...option, pollId: poll.id, questionId: questions[index].id },
          });
        }
        offset += question.options.length;
      }
      return {
        ...poll,
        options: await tx.pollOption.findMany({
          where: { pollId: poll.id },
          orderBy: { sortOrder: "asc" },
        }),
      };
    });
  }
  return prisma.poll.create({
    data: { ...data, options: { create: optionData(input, imageUploads) } },
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
        questions: { orderBy: { sortOrder: "asc" } },
        options: {
          orderBy: { sortOrder: "asc" },
          include: {
            images: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, originalName: true, sizeBytes: true },
            },
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
  const now = new Date();
  const status = effectivePollStatus(poll.status, poll.closesAt, now);
  const reopening = pollReopenState(poll, now);
  const questions = poll.questions.map((question) => {
    const options = poll.options.filter((option) => option.questionId === question.id);
    const summary = summarizePollResults(options);
    const myIds = options
      .filter((option) => myOptionIds.includes(option.id))
      .map((option) => option.id);
    return {
      id: question.id,
      title: question.title,
      type: question.type,
      totalVoters: summary.totalVoters,
      myOptionIds: myIds,
      canVote: status === "OPEN" && (poll.allowVoteChange || myIds.length === 0),
    };
  });
  return {
    id: poll.id,
    communityId: poll.communityId,
    createdById: poll.createdById,
    title: poll.title,
    description: poll.description,
    type: poll.type,
    allowVoteChange: poll.allowVoteChange,
    allowMemberOptions: poll.allowMemberOptions,
    canAddOptions:
      status === "OPEN" &&
      (poll.allowMemberOptions || canManagePoll(userId, membership.role, poll)),
    questions,
    closesAt: poll.closesAt,
    status,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
    createdBy: poll.createdBy,
    canManage: canManagePoll(userId, membership.role, poll),
    canReopen:
      status === "CLOSED" && reopening.canReopen && canManagePoll(userId, membership.role, poll),
    reopenUntil: status === "CLOSED" ? reopening.reopenUntil : null,
    canVote:
      status === "OPEN" &&
      (poll.type === "GROUPED"
        ? questions.some((question) => question.canVote)
        : poll.allowVoteChange || myOptionIds.length === 0),
    myOptionIds,
    totalVoters: summary.totalVoters,
    options: poll.options.map((option) => {
      const groupSummary = option.questionId
        ? summarizePollResults(
            poll.options.filter((candidate) => candidate.questionId === option.questionId),
          )
        : summary;
      const optionSummary = groupSummary.options.find((item) => item.optionId === option.id)!;
      const date = option.dateValue ? formatCivilDate(option.dateValue) : null;
      return {
        id: option.id,
        questionId: option.questionId,
        label: option.label,
        ...parsePollOptionMetadata(option.metadata),
        images: option.images.map((image) => ({
          id: image.id,
          originalName: image.originalName,
          sizeBytes: image.sizeBytes,
          url: `/api/communities/${communityId}/polls/${poll.id}/options/${option.id}/images/${image.id}`,
        })),
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

async function requirePollForUpdate(
  tx: Prisma.TransactionClient,
  userId: string,
  communityId: string,
  pollId: string,
) {
  const membership = assertFound(
    await tx.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
  const existing = assertFound(
    await tx.poll.findFirst({
      where: { id: pollId, communityId },
    }),
    "Votação não encontrada.",
  );
  // All votes, option additions and settings changes share this write lock.
  await tx.poll.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
  return { poll: existing, membership };
}

async function requireManageableOpenChoicePollForUpdate(
  tx: Prisma.TransactionClient,
  userId: string,
  communityId: string,
  pollId: string,
) {
  const { poll, membership } = await requirePollForUpdate(tx, userId, communityId, pollId);
  assertCanManagePoll(userId, membership.role, poll);
  if (effectivePollStatus(poll.status, poll.closesAt) === "CLOSED") {
    throw new AppError("Votações encerradas não podem ter o álbum alterado.", 409, "POLL_CLOSED");
  }
  if (poll.type === "DATE_OPTIONS") {
    throw new AppError(
      "Votações de data não aceitam álbuns nas opções.",
      400,
      "POLL_IMAGES_NOT_ALLOWED",
    );
  }
  return poll;
}

async function runPollMutationTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") {
        throw error;
      }
      if (attempt === 2)
        throw new AppError(
          "A votação mudou. Atualize a página e tente novamente.",
          409,
          "POLL_CONFLICT",
        );
    }
  }
  throw new AppError("Não foi possível atualizar a votação. Tente novamente.", 409);
}

export async function addPollOptionImages(
  userId: string,
  communityId: string,
  pollId: string,
  optionId: string,
  images: PollImageUpload[],
) {
  if (!images.length) throw new AppError("Selecione ao menos uma foto.");
  return runPollMutationTransaction(async (tx) => {
    await requireManageableOpenChoicePollForUpdate(tx, userId, communityId, pollId);
    assertFound(
      await tx.pollOption.findFirst({
        where: { id: optionId, pollId },
        select: { id: true },
      }),
      "Opção da votação não encontrada.",
    );

    const optionImageCount = await tx.pollOptionImage.count({ where: { optionId } });
    if (optionImageCount + images.length > MAX_POLL_OPTION_IMAGES) {
      throw new AppError(
        `Cada opção pode ter no máximo ${MAX_POLL_OPTION_IMAGES} fotos.`,
        400,
        "TOO_MANY_POLL_IMAGES",
      );
    }
    const albumSize = await tx.pollOptionImage.aggregate({
      where: { option: { pollId } },
      _sum: { sizeBytes: true },
    });
    const uploadedBytes = images.reduce((total, image) => total + image.data.byteLength, 0);
    if ((albumSize._sum.sizeBytes ?? 0) + uploadedBytes > MAX_POLL_ALBUM_BYTES) {
      throw new AppError(
        "Os álbuns da votação podem ter no máximo 30 MB.",
        413,
        "POLL_IMAGES_TOO_LARGE",
      );
    }
    const lastImage = await tx.pollOptionImage.findFirst({
      where: { optionId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const firstSortOrder = (lastImage?.sortOrder ?? -1) + 1;
    const created: Array<{ id: string; originalName: string; sizeBytes: number }> = [];
    for (const [index, image] of images.entries()) {
      if (image.sizeBytes !== image.data.byteLength) {
        throw new AppError("Uma foto possui tamanho inválido.", 400, "INVALID_POLL_IMAGE_SIZE");
      }
      created.push(
        await tx.pollOptionImage.create({
          data: {
            optionId,
            data: image.data,
            contentType: image.contentType,
            originalName: image.originalName,
            sizeBytes: image.sizeBytes,
            sortOrder: firstSortOrder + index,
          },
          select: { id: true, originalName: true, sizeBytes: true },
        }),
      );
    }
    return created.map((image) => ({
      ...image,
      url: `/api/communities/${communityId}/polls/${pollId}/options/${optionId}/images/${image.id}`,
    }));
  });
}

export async function deletePollOptionImage(
  userId: string,
  communityId: string,
  pollId: string,
  optionId: string,
  imageId: string,
) {
  return runPollMutationTransaction(async (tx) => {
    await requireManageableOpenChoicePollForUpdate(tx, userId, communityId, pollId);
    const image = assertFound(
      await tx.pollOptionImage.findFirst({
        where: { id: imageId, optionId, option: { pollId } },
        select: { id: true },
      }),
      "Imagem não encontrada.",
    );
    await tx.pollOptionImage.delete({ where: { id: image.id } });
    return image;
  });
}

export async function getPollOptionImage(
  userId: string,
  communityId: string,
  pollId: string,
  optionId: string,
  imageId: string,
) {
  await requireMembership(userId, communityId);
  return assertFound(
    await prisma.pollOptionImage.findFirst({
      where: {
        id: imageId,
        optionId,
        option: { pollId, poll: { communityId } },
      },
      select: {
        data: true,
        contentType: true,
        originalName: true,
        sizeBytes: true,
      },
    }),
    "Imagem não encontrada.",
  );
}

export async function updatePoll(
  userId: string,
  communityId: string,
  pollId: string,
  input: UpdatePollInput,
) {
  return runPollMutationTransaction(async (tx) => {
    const { poll, membership } = await requirePollForUpdate(tx, userId, communityId, pollId);
    assertCanManagePoll(userId, membership.role, poll);
    if (effectivePollStatus(poll.status, poll.closesAt) === "CLOSED") {
      throw new AppError("Votações encerradas não podem ser editadas.", 409, "POLL_CLOSED");
    }
    return tx.poll.update({
      where: { id: pollId },
      data: {
        title: input.title,
        description: input.description,
        allowVoteChange: input.allowVoteChange,
        allowMemberOptions: input.allowMemberOptions,
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
      },
    });
  });
}

export async function closePoll(userId: string, communityId: string, pollId: string) {
  return runPollMutationTransaction(async (tx) => {
    const { poll, membership } = await requirePollForUpdate(tx, userId, communityId, pollId);
    assertCanManagePoll(userId, membership.role, poll);
    if (effectivePollStatus(poll.status, poll.closesAt) === "CLOSED") return poll;
    return tx.poll.update({
      where: { id: pollId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
  });
}

export async function reopenPoll(
  userId: string,
  communityId: string,
  pollId: string,
  input: ReopenPollInput,
  now = new Date(),
) {
  return runPollMutationTransaction(async (tx) => {
    const membership = assertFound(
      await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: { role: true },
      }),
      "Você não participa desta comunidade.",
    );
    const existing = assertFound(
      await tx.poll.findFirst({
        where: { id: pollId, communityId },
        select: { id: true },
      }),
      "Votação não encontrada.",
    );
    await tx.$queryRaw`SELECT "id" FROM "Poll" WHERE "id" = ${existing.id}::uuid FOR UPDATE`;
    const poll = assertFound(
      await tx.poll.findUnique({ where: { id: existing.id } }),
      "Votação não encontrada.",
    );
    assertCanManagePoll(userId, membership.role, poll);
    if (effectivePollStatus(poll.status, poll.closesAt, now) === "OPEN") {
      throw new AppError("Esta votação já está aberta.", 409, "POLL_ALREADY_OPEN");
    }
    if (!pollReopenState(poll, now).canReopen) {
      throw new AppError(
        "O prazo de 15 dias para reabrir esta votação expirou.",
        409,
        "POLL_REOPEN_WINDOW_EXPIRED",
      );
    }
    let closesAt: Date;
    try {
      closesAt = calculatePollReopenDeadline(input.durationDays, now);
    } catch {
      throw new AppError(
        "A votação pode ser reaberta por um período de 1 a 15 dias.",
        400,
        "INVALID_POLL_REOPEN_DURATION",
      );
    }
    return tx.poll.update({
      where: { id: poll.id },
      data: { status: "OPEN", closesAt, closedAt: null },
    });
  });
}

function pollClosedError() {
  return new AppError("Esta votação foi encerrada.", 409, "POLL_CLOSED");
}

export async function addPollOption(
  userId: string,
  communityId: string,
  pollId: string,
  input: AddPollOptionInput,
) {
  return runPollMutationTransaction(async (tx) => {
    const { poll, membership } = await requirePollForUpdate(tx, userId, communityId, pollId);
    if (effectivePollStatus(poll.status, poll.closesAt) === "CLOSED") throw pollClosedError();
    if (!poll.allowMemberOptions) assertCanManagePoll(userId, membership.role, poll);
    await resolveVoteType(tx, poll, input.questionId);
    const questionId = input.questionId ?? null;
    const existing = await tx.pollOption.findMany({
      where: { pollId, questionId },
      select: { label: true, dateValue: true },
    });
    if (existing.length >= 20)
      throw new AppError("Cada pergunta aceita no máximo 20 opções.", 400, "TOO_MANY_OPTIONS");
    let dateValue: Date | null = null;
    let label = input.label;
    if (poll.type === "DATE_OPTIONS") {
      if (!input.dateValue) throw new AppError("Informe a data da opção.");
      dateValue = parseCivilDate(input.dateValue);
      const dates = [
        ...existing.flatMap((option) =>
          option.dateValue ? [formatCivilDate(option.dateValue)] : [],
        ),
        input.dateValue,
      ].sort();
      if (
        input.dateValue < civilDateInTimeZone(new Date(), poll.timezone) ||
        daysBetweenCivilDates(dates[0], dates.at(-1)!) > 366
      ) {
        throw new AppError(
          "A data deve ser atual ou futura e estar no intervalo de 367 dias das opções.",
          400,
          "INVALID_OPTION_DATE",
        );
      }
      if (existing.some((option) => option.dateValue?.getTime() === dateValue!.getTime()))
        throw new AppError("Esta data já está na votação.", 409, "DUPLICATE_OPTION");
      label = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        weekday: "long",
        timeZone: "UTC",
      }).format(dateValue);
    } else {
      if (input.dateValue) throw new AppError("Esta votação não aceita opções de data.");
      if (
        existing.some(
          (option) => option.label.toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR"),
        )
      )
        throw new AppError("Esta opção já existe nesta pergunta.", 409, "DUPLICATE_OPTION");
    }
    const last = await tx.pollOption.aggregate({ where: { pollId }, _max: { sortOrder: true } });
    return tx.pollOption.create({
      data: {
        pollId,
        questionId,
        label,
        dateValue,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        ...(poll.type === "DATE_OPTIONS"
          ? {}
          : {
              metadata: {
                description: input.description,
                imageUrl: input.imageUrl,
                websiteUrl: input.websiteUrl,
                location: input.location,
              },
            }),
      },
    });
  });
}

async function resolveVoteType(
  tx: Prisma.TransactionClient,
  poll: { id: string; type: import("@prisma/client").PollType },
  questionId?: string,
) {
  if (poll.type !== "GROUPED") {
    if (questionId)
      throw new AppError("Esta votação não possui perguntas separadas.", 400, "INVALID_QUESTION");
    return poll.type;
  }
  if (!questionId)
    throw new AppError("Escolha a pergunta em que deseja votar.", 400, "INVALID_QUESTION");
  const question = await tx.pollQuestion.findFirst({
    where: { id: questionId, pollId: poll.id },
    select: { type: true },
  });
  if (!question)
    throw new AppError("Pergunta não encontrada nesta votação.", 400, "INVALID_QUESTION");
  return question.type;
}

export async function castVote(
  userId: string,
  communityId: string,
  pollId: string,
  optionIds: string[],
  questionId?: string,
) {
  return runPollMutationTransaction(async (tx) => {
    const { poll } = await requirePollForUpdate(tx, userId, communityId, pollId);
    const type = await resolveVoteType(tx, poll, questionId);
    try {
      assertPollAcceptsVotes(poll);
      validateVoteSelection(type, optionIds);
    } catch (error) {
      if (error instanceof Error && error.message === "POLL_CLOSED") throw pollClosedError();
      throw new AppError("Selecione uma opção válida.", 400, "INVALID_VOTE_SELECTION");
    }
    const options = await tx.pollOption.findMany({
      where: { pollId, questionId: questionId ?? null },
      select: { id: true },
    });
    const validOptionIds = new Set(options.map((option) => option.id));
    if (optionIds.some((optionId) => !validOptionIds.has(optionId))) {
      throw new AppError(
        "Uma opção selecionada não pertence a esta votação.",
        400,
        "INVALID_OPTION",
      );
    }
    const voteWhere = { pollId, userId, ...(questionId ? { option: { questionId } } : {}) };
    const votes = await tx.pollVote.findMany({ where: voteWhere, select: { optionId: true } });
    const previousIds = votes.map((vote) => vote.optionId).sort();
    const nextIds = [...optionIds].sort();
    const sameSelection =
      previousIds.length === nextIds.length &&
      previousIds.every((optionId, index) => optionId === nextIds[index]);
    if (votes.length && !poll.allowVoteChange) {
      if (sameSelection) return { optionIds: previousIds };
      throw new AppError(
        "Esta votação não permite alterar o voto.",
        409,
        "VOTE_CHANGE_NOT_ALLOWED",
      );
    }
    await tx.pollVote.deleteMany({ where: voteWhere });
    await tx.pollVote.createMany({
      data: optionIds.map((optionId) => ({ pollId, optionId, userId })),
    });
    return { optionIds };
  });
}

export async function removeVote(
  userId: string,
  communityId: string,
  pollId: string,
  questionId?: string,
) {
  return runPollMutationTransaction(async (tx) => {
    const { poll } = await requirePollForUpdate(tx, userId, communityId, pollId);
    await resolveVoteType(tx, poll, questionId);
    try {
      assertPollAcceptsVotes(poll);
    } catch {
      throw pollClosedError();
    }
    const voteWhere = { pollId, userId, ...(questionId ? { option: { questionId } } : {}) };
    const voteCount = await tx.pollVote.count({ where: voteWhere });
    if (voteCount && !poll.allowVoteChange) {
      throw new AppError(
        "Esta votação não permite remover o voto.",
        409,
        "VOTE_CHANGE_NOT_ALLOWED",
      );
    }
    return tx.pollVote.deleteMany({ where: voteWhere });
  });
}
