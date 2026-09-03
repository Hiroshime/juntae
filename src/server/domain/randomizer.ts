import { randomInt } from "node:crypto";
import type {
  RandomizerConstraints,
  RandomizerEntry,
  RandomizerRequest,
  RandomizerResult,
} from "@/lib/randomizer";

export type { RandomizerEntry, RandomizerRequest, RandomizerResult } from "@/lib/randomizer";

type GroupConfiguration = {
  groupCount: number;
  maxGroupSize?: number;
  groupNames?: string[];
};

export class RandomizerConfigurationError extends Error {
  constructor(
    message: string,
    public readonly code = "INVALID_RANDOMIZER_CONFIGURATION",
  ) {
    super(message);
    this.name = "RandomizerConfigurationError";
  }
}

export type RandomIndex = (upperExclusive: number) => number;

function secureRandomIndex(upperExclusive: number) {
  return randomInt(upperExclusive);
}

function shuffled<T>(values: readonly T[], randomIndex: RandomIndex) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = randomIndex(index + 1);
    [result[index], result[selected]] = [result[selected], result[index]];
  }
  return result;
}

function assertEntries(entries: RandomizerEntry[], label: string, allowEmpty = false) {
  if (!allowEmpty && entries.length === 0) {
    throw new RandomizerConfigurationError(`${label} não pode ficar vazio.`, "EMPTY_INPUT");
  }
  if (entries.length > 200) {
    throw new RandomizerConfigurationError(`${label} aceita no máximo 200 entradas.`);
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.id.trim() || !entry.label.trim()) {
      throw new RandomizerConfigurationError(`${label} contém uma entrada inválida.`);
    }
    if (ids.has(entry.id)) {
      throw new RandomizerConfigurationError(
        `Cada entrada de ${label.toLocaleLowerCase("pt-BR")} precisa ter um identificador único.`,
      );
    }
    ids.add(entry.id);
  }
}

function balancedCapacities(total: number, groupCount: number) {
  const base = Math.floor(total / groupCount);
  const extra = total % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function buildParticipantBlocks(
  participants: RandomizerEntry[],
  constraints: RandomizerConstraints,
  groupCount: number,
) {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const parent = new Map(participants.map((participant) => [participant.id, participant.id]));
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current) {
      throw new RandomizerConfigurationError("Uma restrição referencia um participante inválido.");
    }
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (first: string, second: string) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent.set(secondRoot, firstRoot);
  };

  for (const together of constraints.together ?? []) {
    if (together.length < 2) continue;
    for (let index = 1; index < together.length; index += 1) {
      union(together[0], together[index]);
    }
  }

  for (const [first, second] of constraints.separate ?? []) {
    if (find(first) === find(second)) {
      throw new RandomizerConfigurationError(
        `${byId.get(first)?.label} e ${byId.get(second)?.label} não podem ficar juntos e separados ao mesmo tempo.`,
        "IMPOSSIBLE_CONSTRAINTS",
      );
    }
  }

  const fixedByRoot = new Map<string, number>();
  for (const fixed of constraints.fixedGroups ?? []) {
    if (
      !Number.isInteger(fixed.groupIndex) ||
      fixed.groupIndex < 0 ||
      fixed.groupIndex >= groupCount
    ) {
      throw new RandomizerConfigurationError("Uma posição fixa aponta para um grupo inexistente.");
    }
    const root = find(fixed.participantId);
    const current = fixedByRoot.get(root);
    if (current != null && current !== fixed.groupIndex) {
      throw new RandomizerConfigurationError(
        "Participantes configurados para ficar juntos foram fixados em grupos diferentes.",
        "IMPOSSIBLE_CONSTRAINTS",
      );
    }
    fixedByRoot.set(root, fixed.groupIndex);
  }

  const captainIds = new Set(constraints.captainIds ?? []);
  for (const captainId of captainIds) find(captainId);
  if (captainIds.size > groupCount) {
    throw new RandomizerConfigurationError(
      "Há mais capitães do que grupos disponíveis.",
      "IMPOSSIBLE_CONSTRAINTS",
    );
  }

  const grouped = new Map<string, RandomizerEntry[]>();
  for (const participant of participants) {
    const root = find(participant.id);
    grouped.set(root, [...(grouped.get(root) ?? []), participant]);
  }

  return [...grouped.entries()].map(([root, members]) => {
    const captainCount = members.filter((member) => captainIds.has(member.id)).length;
    if (captainCount > 1) {
      throw new RandomizerConfigurationError(
        "Dois capitães configurados para ficar juntos não cabem em grupos diferentes.",
        "IMPOSSIBLE_CONSTRAINTS",
      );
    }
    return {
      members,
      fixedGroup: fixedByRoot.get(root),
      hasCaptain: captainCount === 1,
    };
  });
}

function distributeIntoGroups(
  participants: RandomizerEntry[],
  capacities: number[],
  constraints: RandomizerConstraints,
  randomIndex: RandomIndex,
) {
  const blocks = shuffled(
    buildParticipantBlocks(participants, constraints, capacities.length),
    randomIndex,
  ).sort((first, second) => second.members.length - first.members.length);
  if (blocks.some((block) => block.members.length > Math.max(...capacities))) {
    throw new RandomizerConfigurationError(
      "Um conjunto de pessoas que deve permanecer junto é maior que os grupos disponíveis.",
      "IMPOSSIBLE_CONSTRAINTS",
    );
  }

  const separate = new Set(
    (constraints.separate ?? []).flatMap(([first, second]) => [
      `${first}:${second}`,
      `${second}:${first}`,
    ]),
  );
  const groups: RandomizerEntry[][] = capacities.map(() => []);
  const hasCaptain = capacities.map(() => false);

  function place(blockIndex: number): boolean {
    if (blockIndex === blocks.length) return true;
    const block = blocks[blockIndex];
    const candidates = shuffled(
      block.fixedGroup == null ? capacities.map((_, index) => index) : [block.fixedGroup],
      randomIndex,
    ).sort((first, second) => {
      const firstRatio = groups[first].length / capacities[first];
      const secondRatio = groups[second].length / capacities[second];
      return firstRatio - secondRatio;
    });

    for (const groupIndex of candidates) {
      if (groups[groupIndex].length + block.members.length > capacities[groupIndex]) continue;
      if (block.hasCaptain && hasCaptain[groupIndex]) continue;
      const conflicts = block.members.some((member) =>
        groups[groupIndex].some((placed) => separate.has(`${member.id}:${placed.id}`)),
      );
      if (conflicts) continue;

      groups[groupIndex].push(...block.members);
      if (block.hasCaptain) hasCaptain[groupIndex] = true;
      if (place(blockIndex + 1)) return true;
      groups[groupIndex].splice(groups[groupIndex].length - block.members.length);
      if (block.hasCaptain) hasCaptain[groupIndex] = false;
    }
    return false;
  }

  if (!place(0)) {
    throw new RandomizerConfigurationError(
      "Não foi possível distribuir as pessoas respeitando todas as regras. Revise as restrições ou aumente a quantidade de grupos.",
      "IMPOSSIBLE_CONSTRAINTS",
    );
  }
  return groups;
}

function groupResult(
  groups: RandomizerEntry[][],
  labels: string[],
  captainIds: string[] = [],
  unassigned?: RandomizerEntry[],
): RandomizerResult {
  const captains = new Set(captainIds);
  return {
    kind: "GROUPS",
    groups: groups.map((members, index) => ({
      id: `group-${index + 1}`,
      label: labels[index] || `Grupo ${index + 1}`,
      members,
      captainId: members.find((member) => captains.has(member.id))?.id,
    })),
    ...(unassigned?.length ? { unassigned } : {}),
  };
}

function groupsConfiguration(request: RandomizerRequest): GroupConfiguration {
  const groupCount = request.configuration.groupCount;
  if (!Number.isInteger(groupCount) || !groupCount || groupCount < 1) {
    throw new RandomizerConfigurationError("Informe uma quantidade válida de grupos.");
  }
  if (groupCount > request.participants.length) {
    throw new RandomizerConfigurationError("A quantidade de grupos não pode superar as pessoas.");
  }
  const maxGroupSize = request.configuration.maxGroupSize;
  if (maxGroupSize != null && (!Number.isInteger(maxGroupSize) || maxGroupSize < 1)) {
    throw new RandomizerConfigurationError("O tamanho máximo do grupo é inválido.");
  }
  if (maxGroupSize != null && groupCount * maxGroupSize < request.participants.length) {
    throw new RandomizerConfigurationError(
      `Faltam ${request.participants.length - groupCount * maxGroupSize} vagas nos grupos.`,
      "INSUFFICIENT_CAPACITY",
    );
  }
  return {
    groupCount,
    maxGroupSize,
    groupNames: request.configuration.groupNames,
  };
}

function generateTeams(request: RandomizerRequest, randomIndex: RandomIndex) {
  const config = groupsConfiguration(request);
  const capacities = balancedCapacities(request.participants.length, config.groupCount);
  const groups = distributeIntoGroups(
    request.participants,
    capacities,
    request.constraints ?? {},
    randomIndex,
  );
  return groupResult(
    groups,
    Array.from(
      { length: config.groupCount },
      (_, index) => config.groupNames?.[index]?.trim() || `Time ${index + 1}`,
    ),
    request.constraints?.captainIds,
  );
}

function generateGroups(request: RandomizerRequest, randomIndex: RandomIndex) {
  const maxGroupSize = request.configuration.maxGroupSize;
  if (!Number.isInteger(maxGroupSize) || !maxGroupSize || maxGroupSize < 1) {
    throw new RandomizerConfigurationError("Informe um tamanho máximo válido para os grupos.");
  }
  const groupCount = Math.ceil(request.participants.length / maxGroupSize);
  const capacities = balancedCapacities(request.participants.length, groupCount);
  const groups = distributeIntoGroups(
    request.participants,
    capacities,
    request.constraints ?? {},
    randomIndex,
  );
  return groupResult(
    groups,
    Array.from({ length: groupCount }, (_, index) => `Grupo ${index + 1}`),
  );
}

function generateCars(request: RandomizerRequest, randomIndex: RandomIndex) {
  const drivers = request.configuration.drivers ?? [];
  assertEntries(drivers, "A lista de motoristas");
  if (drivers.some((driver) => !Number.isInteger(driver.capacity) || driver.capacity < 0)) {
    throw new RandomizerConfigurationError("As vagas dos motoristas precisam ser números válidos.");
  }
  const availableSeats = drivers.reduce((sum, driver) => sum + driver.capacity, 0);
  if (availableSeats < request.participants.length) {
    throw new RandomizerConfigurationError(
      `Faltam ${request.participants.length - availableSeats} vagas para passageiros.`,
      "INSUFFICIENT_CAPACITY",
    );
  }
  const groups = distributeIntoGroups(
    request.participants,
    drivers.map((driver) => driver.capacity),
    request.constraints ?? {},
    randomIndex,
  );
  return groupResult(
    groups,
    drivers.map((driver) => `🚗 ${driver.label}`),
  );
}

function generateAssignments(request: RandomizerRequest, randomIndex: RandomIndex) {
  const items = request.configuration.items ?? [];
  assertEntries(items, "A lista de itens");
  const allowRepeated = request.configuration.allowRepeatedItems === true;
  if (!allowRepeated && items.length < request.participants.length) {
    throw new RandomizerConfigurationError(
      `Faltam ${request.participants.length - items.length} itens para concluir a distribuição.`,
      "INSUFFICIENT_ITEMS",
    );
  }
  const excluded = new Set(
    (request.constraints?.excludedAssignments ?? []).map(
      ({ participantId, itemId }) => `${participantId}:${itemId}`,
    ),
  );
  const participantIds = new Set(request.participants.map((participant) => participant.id));
  const itemIds = new Set(items.map((item) => item.id));
  if (
    (request.constraints?.excludedAssignments ?? []).some(
      ({ participantId, itemId }) => !participantIds.has(participantId) || !itemIds.has(itemId),
    )
  ) {
    throw new RandomizerConfigurationError(
      "Uma restrição de item referencia uma pessoa ou item inexistente.",
    );
  }
  const participants = shuffled(request.participants, randomIndex);
  const assignments: Array<{ participant: RandomizerEntry; item: RandomizerEntry }> = [];
  const used = new Set<string>();

  function assign(index: number): boolean {
    if (index === participants.length) return true;
    const participant = participants[index];
    for (const item of shuffled(items, randomIndex)) {
      if ((!allowRepeated && used.has(item.id)) || excluded.has(`${participant.id}:${item.id}`)) {
        continue;
      }
      assignments.push({ participant, item });
      used.add(item.id);
      if (assign(index + 1)) return true;
      assignments.pop();
      used.delete(item.id);
    }
    return false;
  }

  if (!assign(0)) {
    throw new RandomizerConfigurationError(
      "Não foi possível distribuir os itens respeitando as restrições.",
      "IMPOSSIBLE_CONSTRAINTS",
    );
  }
  return { kind: "ASSIGNMENTS", assignments } satisfies RandomizerResult;
}

function generatePairs(request: RandomizerRequest, randomIndex: RandomIndex) {
  const odd = request.participants.length % 2 === 1;
  const oddMode = request.configuration.oddMode;
  if (odd && !oddMode) {
    throw new RandomizerConfigurationError(
      "Escolha se a pessoa excedente formará um trio ou ficará sem par.",
    );
  }
  if (odd && oddMode === "TRIO" && request.participants.length < 3) {
    throw new RandomizerConfigurationError(
      "É preciso ter ao menos três pessoas para formar um trio.",
    );
  }

  const candidates =
    odd && oddMode === "UNPAIRED" ? shuffled(request.participants, randomIndex) : [];
  const attempts = candidates.length ? candidates : [undefined];
  for (const unassigned of attempts) {
    if (
      unassigned &&
      (request.constraints?.together ?? []).some(
        (group) => group.includes(unassigned.id) && group.length > 1,
      )
    ) {
      continue;
    }
    const participants = unassigned
      ? request.participants.filter((participant) => participant.id !== unassigned.id)
      : request.participants;
    const constraints = unassigned
      ? {
          ...request.constraints,
          together: request.constraints?.together?.filter(
            (group) => !group.includes(unassigned.id),
          ),
          separate: request.constraints?.separate?.filter(
            ([first, second]) => first !== unassigned.id && second !== unassigned.id,
          ),
          fixedGroups: request.constraints?.fixedGroups?.filter(
            (fixed) => fixed.participantId !== unassigned.id,
          ),
          captainIds: request.constraints?.captainIds?.filter((id) => id !== unassigned.id),
        }
      : (request.constraints ?? {});
    const groupCount =
      odd && oddMode === "TRIO" ? (participants.length - 3) / 2 + 1 : participants.length / 2;
    const capacities = Array.from({ length: groupCount }, (_, index) =>
      odd && oddMode === "TRIO" && index === 0 ? 3 : 2,
    );
    try {
      const groups = distributeIntoGroups(participants, capacities, constraints, randomIndex);
      return groupResult(
        groups,
        groups.map((_, index) => (capacities[index] === 3 ? "Trio" : `Dupla ${index + 1}`)),
        [],
        unassigned ? [unassigned] : undefined,
      );
    } catch (error) {
      if (!(error instanceof RandomizerConfigurationError) || !unassigned) throw error;
    }
  }
  throw new RandomizerConfigurationError(
    "Não foi possível formar as duplas respeitando as regras.",
    "IMPOSSIBLE_CONSTRAINTS",
  );
}

export function generateRandomResult(
  request: RandomizerRequest,
  randomIndex: RandomIndex = secureRandomIndex,
): RandomizerResult {
  const participantsMayBeEmpty = request.presetType === "PICK_ITEM";
  assertEntries(request.participants, "A lista de participantes", participantsMayBeEmpty);
  switch (request.presetType) {
    case "TEAMS":
      return generateTeams(request, randomIndex);
    case "GROUPS":
      return generateGroups(request, randomIndex);
    case "CARS":
      return generateCars(request, randomIndex);
    case "ASSIGN_ITEMS":
      return generateAssignments(request, randomIndex);
    case "PICK_PEOPLE": {
      const count = request.configuration.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > request.participants.length) {
        throw new RandomizerConfigurationError("A quantidade de pessoas escolhidas é inválida.");
      }
      return {
        kind: "SELECTION",
        selected: shuffled(request.participants, randomIndex).slice(0, count),
      };
    }
    case "PICK_ITEM": {
      const items = request.configuration.items ?? [];
      assertEntries(items, "A lista de itens");
      const count = request.configuration.count ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > items.length) {
        throw new RandomizerConfigurationError("A quantidade de itens escolhidos é inválida.");
      }
      return { kind: "SELECTION", selected: shuffled(items, randomIndex).slice(0, count) };
    }
    case "RANDOM_ORDER":
      return { kind: "ORDER", ordered: shuffled(request.participants, randomIndex) };
    case "PAIRS":
      return generatePairs(request, randomIndex);
  }
}

export function validateRandomizerConfiguration(request: RandomizerRequest) {
  generateRandomResult(request, () => 0);
  return true;
}
