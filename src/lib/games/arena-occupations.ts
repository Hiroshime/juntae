import type { ArenaStatModifiers } from "@/lib/games/arena";

export const ARENA_OCCUPATION_TASKS = [
  {
    key: "FOUNDATION_DRILLS",
    kind: "TRAINING",
    name: "Fundamentos da arena",
    description: "Postura, passos e golpes básicos sob supervisão.",
    durationHours: 1,
    requiredLevel: 1,
    riskPercent: 0,
    rewards: { gold: 0, experience: 25, shelterPoints: 1 },
  },
  {
    key: "ENDURANCE_CIRCUIT",
    kind: "TRAINING",
    name: "Circuito de resistência",
    description: "Um treino longo de fôlego, carga e repetição.",
    durationHours: 2,
    requiredLevel: 2,
    riskPercent: 0,
    rewards: { gold: 0, experience: 55, shelterPoints: 2 },
  },
  {
    key: "CHAMPION_DISCIPLINE",
    kind: "TRAINING",
    name: "Disciplina do campeão",
    description: "Uma sessão avançada reservada aos gladiadores experientes.",
    durationHours: 4,
    requiredLevel: 4,
    riskPercent: 0,
    rewards: { gold: 0, experience: 120, shelterPoints: 4 },
  },
  {
    key: "MARKET_PATROL",
    kind: "MISSION",
    name: "Patrulha do mercado",
    description: "Proteja mercadores e encontre problemas nos becos da Vila do Sol.",
    durationHours: 1,
    requiredLevel: 1,
    riskPercent: 10,
    rewards: { gold: 70, experience: 20, shelterPoints: 2 },
  },
  {
    key: "CARAVAN_ESCORT",
    kind: "MISSION",
    name: "Escolta da caravana",
    description: "Conduza suprimentos pelas estradas além dos portões.",
    durationHours: 2,
    requiredLevel: 2,
    riskPercent: 15,
    rewards: { gold: 150, experience: 50, shelterPoints: 4 },
  },
  {
    key: "RUINS_EXPEDITION",
    kind: "MISSION",
    name: "Expedição às ruínas",
    description: "Explore estruturas antigas em busca de materiais raros.",
    durationHours: 4,
    requiredLevel: 4,
    riskPercent: 22,
    rewards: { gold: 320, experience: 110, shelterPoints: 7 },
  },
  {
    key: "FRONTIER_VIGIL",
    kind: "MISSION",
    name: "Vigília da fronteira",
    description: "Passe a noite protegendo a passagem mais perigosa da região.",
    durationHours: 8,
    requiredLevel: 7,
    riskPercent: 30,
    rewards: { gold: 700, experience: 240, shelterPoints: 12 },
  },
] as const;

export const ARENA_OCCUPATION_TASK_KEYS = ARENA_OCCUPATION_TASKS.map((task) => task.key) as [
  string,
  ...string[],
];
export type ArenaOccupationTask = (typeof ARENA_OCCUPATION_TASKS)[number];
export type ArenaIncidentKey = "ROBBED" | "BRUISED" | "EXHAUSTED";

export const ARENA_INCIDENTS: Record<
  ArenaIncidentKey,
  { name: string; description: string; durationHours: number; modifiers: ArenaStatModifiers }
> = {
  ROBBED: {
    name: "Abalado por emboscada",
    description: "Ladrões levaram metade das moedas da missão e sua precisão está reduzida.",
    durationHours: 1,
    modifiers: { accuracy: -4 },
  },
  BRUISED: {
    name: "Ferimentos leves",
    description: "Uma briga deixou seu gladiador machucado e com a guarda reduzida.",
    durationHours: 2,
    modifiers: { maxHealth: -10, guard: -2 },
  },
  EXHAUSTED: {
    name: "Exaustão",
    description: "O esforço excessivo reduz temporariamente energia e movimento.",
    durationHours: 2,
    modifiers: { maxEnergy: -8, movement: -1 },
  },
};

export function arenaOccupationTask(key: string) {
  return ARENA_OCCUPATION_TASKS.find((task) => task.key === key) ?? null;
}

export function resolveArenaOccupation(
  task: ArenaOccupationTask,
  random: () => number = Math.random,
) {
  if (task.kind === "TRAINING" || random() * 100 >= task.riskPercent)
    return {
      incident: null,
      effectDurationHours: 0,
      rewards: { ...task.rewards },
      message: `${task.name} foi concluído sem problemas.`,
    } as const;
  const incidents = Object.keys(ARENA_INCIDENTS) as ArenaIncidentKey[];
  const incident =
    incidents[Math.min(incidents.length - 1, Math.floor(random() * incidents.length))];
  const definition = ARENA_INCIDENTS[incident];
  const gold = incident === "ROBBED" ? Math.floor(task.rewards.gold / 2) : task.rewards.gold;
  return {
    incident,
    effectDurationHours: definition.durationHours,
    rewards: { ...task.rewards, gold },
    message:
      incident === "ROBBED"
        ? `Uma emboscada reduziu a recompensa em moedas. ${definition.description}`
        : definition.description,
  } as const;
}

export function arenaActiveOccupationEffects(
  occupations: ReadonlyArray<{ incident: ArenaIncidentKey | null; effectExpiresAt: Date | null }>,
  now = new Date(),
) {
  return occupations
    .filter(
      (occupation) =>
        occupation.incident && occupation.effectExpiresAt && occupation.effectExpiresAt > now,
    )
    .map((occupation) => {
      const key = occupation.incident!;
      return { key, ...ARENA_INCIDENTS[key], expiresAt: occupation.effectExpiresAt! };
    });
}

export function arenaOccupationEffectModifiers(
  effects: ReturnType<typeof arenaActiveOccupationEffects>,
): ArenaStatModifiers {
  const combined: ArenaStatModifiers = {};
  for (const effect of effects)
    for (const [stat, amount] of Object.entries(effect.modifiers)) {
      const key = stat as keyof ArenaStatModifiers;
      combined[key] = (combined[key] ?? 0) + (amount ?? 0);
    }
  return combined;
}

export function combineArenaStatModifiers(...groups: ArenaStatModifiers[]) {
  const combined: ArenaStatModifiers = {};
  for (const group of groups)
    for (const [stat, amount] of Object.entries(group)) {
      const key = stat as keyof ArenaStatModifiers;
      combined[key] = (combined[key] ?? 0) + (amount ?? 0);
    }
  return combined;
}
