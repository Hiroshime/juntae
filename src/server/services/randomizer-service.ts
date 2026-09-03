import { Prisma, type CommunityRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RandomizerEntry, RandomizerRequest, RandomizerResult } from "@/lib/randomizer";
import type { RandomizerRequestInput, SaveRandomizerRunInput } from "@/lib/validation/randomizer";
import {
  generateRandomResult,
  RandomizerConfigurationError,
  validateRandomizerConfiguration,
} from "@/server/domain/randomizer";
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

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function canManageRun(userId: string, role: CommunityRole, createdById: string) {
  return createdById === userId || role === "OWNER" || role === "ADMIN";
}

export async function getRandomizerSources(userId: string, communityId: string) {
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
      where: { communityId, status: "PUBLISHED", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 50,
      select: {
        id: true,
        title: true,
        startsAt: true,
        rsvps: {
          where: { status: { in: ["GOING", "MAYBE"] } },
          select: {
            status: true,
            user: {
              select: {
                id: true,
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
    }),
  ]);

  return {
    members: members.map((member) => ({
      id: member.userId,
      label: member.displayName || member.user.name,
      avatarUrl: member.user.avatarUrl,
    })),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      participants: event.rsvps.map((rsvp) => ({
        id: rsvp.user.id,
        label: rsvp.user.memberships[0]?.displayName || rsvp.user.name,
        avatarUrl: rsvp.user.avatarUrl,
        status: rsvp.status,
      })),
    })),
  };
}

export async function generateRandomizerResult(
  userId: string,
  communityId: string,
  input: RandomizerRequestInput,
) {
  await requireMembership(userId, communityId);
  try {
    return generateRandomResult(input as RandomizerRequest);
  } catch (error) {
    if (error instanceof RandomizerConfigurationError) {
      throw new AppError(error.message, 400, error.code);
    }
    throw error;
  }
}

function entryMap(entries: RandomizerEntry[]) {
  return new Map(entries.map((entry) => [entry.id, entry.label]));
}

function assertKnownEntries(entries: RandomizerEntry[], allowed: Map<string, string>) {
  for (const entry of entries) {
    if (allowed.get(entry.id) !== entry.label) {
      throw new AppError("O resultado não corresponde aos dados sorteados.", 400, "INVALID_RESULT");
    }
  }
}

function assertSameEntries(actual: RandomizerEntry[], expected: RandomizerEntry[]) {
  assertKnownEntries(actual, entryMap(expected));
  if (
    actual.length !== expected.length ||
    new Set(actual.map((entry) => entry.id)).size !== actual.length
  ) {
    throw new AppError("O resultado não corresponde aos dados sorteados.", 400, "INVALID_RESULT");
  }
}

function expectedResultKind(presetType: RandomizerRequestInput["presetType"]) {
  if (["TEAMS", "GROUPS", "CARS", "PAIRS"].includes(presetType)) return "GROUPS";
  if (presetType === "ASSIGN_ITEMS") return "ASSIGNMENTS";
  if (presetType === "RANDOM_ORDER") return "ORDER";
  return "SELECTION";
}

function invalidResult(message = "O resultado não corresponde aos dados sorteados."): never {
  throw new AppError(message, 400, "INVALID_RESULT");
}

function assertGroupResultMatchesRequest(
  input: RandomizerRequestInput,
  result: Extract<RandomizerResult, { kind: "GROUPS" }>,
) {
  let expectedGroupCount = 0;
  if (input.presetType === "TEAMS") {
    expectedGroupCount = input.configuration.groupCount!;
  } else if (input.presetType === "GROUPS") {
    expectedGroupCount = Math.ceil(input.participants.length / input.configuration.maxGroupSize!);
  } else if (input.presetType === "CARS") {
    expectedGroupCount = input.configuration.drivers!.length;
  } else if (input.presetType === "PAIRS") {
    expectedGroupCount = Math.floor(input.participants.length / 2);
  }

  const expectedUnassigned =
    input.presetType === "PAIRS" &&
    input.participants.length % 2 === 1 &&
    input.configuration.oddMode === "UNPAIRED"
      ? 1
      : 0;
  if (
    result.groups.length !== expectedGroupCount ||
    (result.unassigned?.length ?? 0) !== expectedUnassigned
  ) {
    invalidResult();
  }
  if (result.groups.some((group) => !group.members.length)) {
    invalidResult("O resultado contém um grupo vazio.");
  }

  const groupSizes = result.groups.map((group) => group.members.length);
  if (
    (input.presetType === "TEAMS" || input.presetType === "GROUPS") &&
    Math.max(...groupSizes) - Math.min(...groupSizes) > 1
  ) {
    invalidResult("Os grupos salvos não estão equilibrados.");
  }
  if (
    input.presetType === "GROUPS" &&
    result.groups.some((group) => group.members.length > input.configuration.maxGroupSize!)
  ) {
    invalidResult("Um grupo excede o tamanho máximo configurado.");
  }
  if (input.presetType === "CARS") {
    const drivers = input.configuration.drivers!;
    if (result.groups.some((group, index) => group.members.length > drivers[index].capacity)) {
      invalidResult("Um carro excede a capacidade configurada.");
    }
  }
  if (input.presetType === "PAIRS") {
    const odd = input.participants.length % 2 === 1;
    const trioCount = result.groups.filter((group) => group.members.length === 3).length;
    if (
      result.groups.some((group) => group.members.length < 2 || group.members.length > 3) ||
      (odd && input.configuration.oddMode === "TRIO" && trioCount !== 1) ||
      ((!odd || input.configuration.oddMode === "UNPAIRED") && trioCount !== 0)
    ) {
      invalidResult("As duplas salvas não correspondem à configuração.");
    }
  }

  const groupByParticipant = new Map<string, number>();
  result.groups.forEach((group, groupIndex) =>
    group.members.forEach((member) => groupByParticipant.set(member.id, groupIndex)),
  );
  result.unassigned?.forEach((member) => groupByParticipant.set(member.id, -1));
  for (const together of input.constraints.together ?? []) {
    const groupIndexes = new Set(together.map((id) => groupByParticipant.get(id)));
    if (groupIndexes.size !== 1 || groupIndexes.has(-1) || groupIndexes.has(undefined)) {
      invalidResult("O resultado viola uma regra de pessoas juntas.");
    }
  }
  for (const [first, second] of input.constraints.separate ?? []) {
    if (groupByParticipant.get(first) === groupByParticipant.get(second)) {
      invalidResult("O resultado viola uma regra de pessoas separadas.");
    }
  }
  for (const fixed of input.constraints.fixedGroups ?? []) {
    if (groupByParticipant.get(fixed.participantId) !== fixed.groupIndex) {
      invalidResult("O resultado viola uma posição fixa.");
    }
  }

  const captainIds = new Set(input.constraints.captainIds ?? []);
  if (
    result.groups.some(
      (group) => group.members.filter((member) => captainIds.has(member.id)).length > 1,
    )
  ) {
    invalidResult("O resultado coloca mais de um capitão no mesmo grupo.");
  }
  if (input.presetType === "TEAMS") {
    for (const group of result.groups) {
      const captain = group.members.find((member) => captainIds.has(member.id));
      if (group.captainId !== captain?.id) invalidResult("O capitão do time está incorreto.");
    }
  }
}

function assertResultMatchesRequest(input: RandomizerRequestInput, result: RandomizerResult) {
  if (result.kind !== expectedResultKind(input.presetType)) {
    throw new AppError("O tipo do resultado não corresponde ao sorteio.", 400, "INVALID_RESULT");
  }
  const participantMap = entryMap(input.participants);
  const itemMap = entryMap(input.configuration.items ?? []);
  if (result.kind === "GROUPS") {
    assertSameEntries(
      [...result.groups.flatMap((group) => group.members), ...(result.unassigned ?? [])],
      input.participants,
    );
    assertGroupResultMatchesRequest(input, result);
  } else if (result.kind === "ASSIGNMENTS") {
    assertSameEntries(
      result.assignments.map((assignment) => assignment.participant),
      input.participants,
    );
    assertKnownEntries(
      result.assignments.map((assignment) => assignment.item),
      itemMap,
    );
    if (
      input.configuration.allowRepeatedItems !== true &&
      new Set(result.assignments.map((assignment) => assignment.item.id)).size !==
        result.assignments.length
    ) {
      throw new AppError(
        "O resultado reutiliza um item que deveria ser único.",
        400,
        "INVALID_RESULT",
      );
    }
    const excluded = new Set(
      input.constraints.excludedAssignments?.map(
        ({ participantId, itemId }) => `${participantId}:${itemId}`,
      ) ?? [],
    );
    if (
      result.assignments.some(({ participant, item }) =>
        excluded.has(`${participant.id}:${item.id}`),
      )
    ) {
      throw new AppError("O resultado viola uma regra de distribuição.", 400, "INVALID_RESULT");
    }
  } else if (result.kind === "ORDER") {
    assertSameEntries(result.ordered, input.participants);
  } else {
    const allowed = input.presetType === "PICK_ITEM" ? itemMap : participantMap;
    assertKnownEntries(result.selected, allowed);
    if (
      result.selected.length !== (input.configuration.count ?? 1) ||
      new Set(result.selected.map((entry) => entry.id)).size !== result.selected.length
    ) {
      throw new AppError("O resultado contém uma seleção inválida.", 400, "INVALID_RESULT");
    }
  }
}

export async function saveRandomizerRun(
  userId: string,
  communityId: string,
  input: SaveRandomizerRunInput,
) {
  await requireMembership(userId, communityId);
  try {
    validateRandomizerConfiguration(input.request as RandomizerRequest);
  } catch (error) {
    if (error instanceof RandomizerConfigurationError) {
      throw new AppError(error.message, 400, error.code);
    }
    throw error;
  }
  assertResultMatchesRequest(input.request, input.result as RandomizerResult);
  return prisma.randomizerRun.create({
    data: {
      communityId,
      createdById: userId,
      presetType: input.request.presetType,
      title: input.title,
      configuration: json({
        ...input.request.configuration,
        constraints: input.request.constraints,
      }),
      inputSnapshot: json(input.request.participants),
      result: json(input.result),
    },
    select: { id: true },
  });
}

export async function listSavedRandomizerRuns(
  userId: string,
  communityId: string,
  options: { take: number; skip?: number },
) {
  await requireMembership(userId, communityId);
  return prisma.randomizerRun.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    take: options.take,
    skip: options.skip,
    select: {
      id: true,
      presetType: true,
      title: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export async function getRandomizerRun(userId: string, communityId: string, runId: string) {
  const membership = await requireMembership(userId, communityId);
  const run = assertFound(
    await prisma.randomizerRun.findFirst({
      where: { id: runId, communityId },
      include: { createdBy: { select: { name: true } } },
    }),
    "Sorteio não encontrado.",
  );
  return { ...run, canManage: canManageRun(userId, membership.role, run.createdById) };
}

export async function deleteRandomizerRun(userId: string, communityId: string, runId: string) {
  const membership = await requireMembership(userId, communityId);
  const run = assertFound(
    await prisma.randomizerRun.findFirst({ where: { id: runId, communityId } }),
    "Sorteio não encontrado.",
  );
  if (!canManageRun(userId, membership.role, run.createdById)) {
    throw new AppError(
      "Apenas quem salvou o sorteio ou um administrador pode removê-lo.",
      403,
      "FORBIDDEN",
    );
  }
  await prisma.randomizerRun.delete({ where: { id: runId } });
}
