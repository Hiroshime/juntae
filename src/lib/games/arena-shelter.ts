import type { ArenaOpponent } from "@/lib/games/arena-battle";

export const ARENA_SHELTER_STAGES = [
  {
    level: 1,
    name: "Acampamento de lona",
    description: "Uma fogueira, lona firme e espaço para guardar o essencial.",
    upgradeCost: 8,
  },
  {
    level: 2,
    name: "Cabana do combatente",
    description: "Madeira reforçada protege seus equipamentos entre os duelos.",
    upgradeCost: 18,
  },
  {
    level: 3,
    name: "Pátio fortificado",
    description: "Cercas, portão e um pátio próprio transformam o acampamento.",
    upgradeCost: 32,
  },
  {
    level: 4,
    name: "Casa da arena",
    description: "Pedra, torre de vigia e oficina formam uma base respeitável.",
    upgradeCost: 50,
  },
  {
    level: 5,
    name: "Fortim do campeão",
    description: "Muralhas altas e estandartes anunciam um gladiador veterano.",
    upgradeCost: 75,
  },
  {
    level: 6,
    name: "Cidadela solar",
    description: "Torres solares e salões de pedra dominam a paisagem da arena.",
    upgradeCost: 110,
  },
  {
    level: 7,
    name: "Palácio dos estandartes",
    description: "Um palácio militar reúne aliados, artesãos e troféus de muitas ligas.",
    upgradeCost: 150,
  },
  {
    level: 8,
    name: "Bastilha imperial",
    description: "Muralhas imperiais e torres elevadas tornam o domínio quase inexpugnável.",
    upgradeCost: 200,
  },
  {
    level: 9,
    name: "Fortaleza celeste",
    description: "Cúpulas de cristal e faróis celestes guiam caravanas até o domínio.",
    upgradeCost: 270,
  },
  {
    level: 10,
    name: "Santuário dos imortais",
    description: "O ápice do Refúgio, onde a história do gladiador se torna lenda.",
    upgradeCost: null,
  },
] as const;

export const ARENA_MAX_SHELTER_LEVEL = ARENA_SHELTER_STAGES.length;

export const ARENA_SHELTER_STAT_DETAILS = [
  { key: "defence", label: "Defesa", icon: "♜" },
  { key: "comfort", label: "Conforto", icon: "♨" },
  { key: "supplies", label: "Suprimentos", icon: "◈" },
  { key: "training", label: "Treinamento", icon: "⚔" },
  { key: "prestige", label: "Prestígio", icon: "★" },
] as const;

export type ArenaShelterStatKey = (typeof ARENA_SHELTER_STAT_DETAILS)[number]["key"];
export type ArenaShelterStats = Record<ArenaShelterStatKey, number>;

export const ARENA_SHELTER_ITEM_CATALOG = [
  {
    key: "REINFORCED_CHEST",
    name: "Baú reforçado",
    description: "Mantém provisões e objetos importantes protegidos da chuva e de curiosos.",
    icon: "▣",
    price: 120,
    requiredLevel: 1,
    modifiers: { defence: 1, supplies: 3 },
  },
  {
    key: "IRON_BRAZIER",
    name: "Braseiro de ferro",
    description: "Aquece as noites frias e torna o acampamento mais acolhedor.",
    icon: "♨",
    price: 150,
    requiredLevel: 1,
    modifiers: { comfort: 3, prestige: 1 },
  },
  {
    key: "TRAINING_DUMMY",
    name: "Boneco de treinamento",
    description: "Um alvo robusto para praticar golpes longe da areia do coliseu.",
    icon: "⚔",
    price: 220,
    requiredLevel: 2,
    modifiers: { training: 3, prestige: 1 },
  },
  {
    key: "FORTIFIED_GATE",
    name: "Portão fortificado",
    description: "Madeira pesada e ferragens reforçam a entrada do domínio.",
    icon: "♜",
    price: 320,
    requiredLevel: 2,
    modifiers: { defence: 4 },
  },
  {
    key: "HERB_GARDEN",
    name: "Horta de ervas",
    description: "Ervas, raízes e temperos melhoram a rotina e as reservas do Refúgio.",
    icon: "❧",
    price: 420,
    requiredLevel: 3,
    modifiers: { comfort: 2, supplies: 3 },
  },
  {
    key: "CHAMPION_BANNER",
    name: "Estandarte do campeão",
    description: "Um símbolo visível de longe para registrar as conquistas do gladiador.",
    icon: "⚑",
    price: 650,
    requiredLevel: 4,
    modifiers: { prestige: 5, defence: 1 },
  },
  {
    key: "TACTICAL_ARMORY",
    name: "Armaria tática",
    description: "Armas de treino organizadas para aperfeiçoar técnica e prontidão da guarda.",
    icon: "⚒",
    price: 900,
    requiredLevel: 5,
    modifiers: { training: 5, defence: 2 },
  },
  {
    key: "FIELD_INFIRMARY",
    name: "Enfermaria de campanha",
    description: "Leitos, ervas e instrumentos mantêm o domínio preparado após cada batalha.",
    icon: "✚",
    price: 1_050,
    requiredLevel: 5,
    modifiers: { comfort: 4, supplies: 4 },
  },
  {
    key: "SENTINEL_TOWER",
    name: "Torre da sentinela",
    description: "Uma torre de vigia antecipa ameaças e protege os acessos do Refúgio.",
    icon: "♜",
    price: 1_250,
    requiredLevel: 6,
    modifiers: { defence: 6, prestige: 2 },
  },
  {
    key: "MARBLE_AQUEDUCT",
    name: "Aqueduto de mármore",
    description: "Água corrente abastece jardins, banhos e reservas mesmo durante cercos.",
    icon: "≋",
    price: 1_500,
    requiredLevel: 7,
    modifiers: { comfort: 5, supplies: 6 },
  },
  {
    key: "WAR_LIBRARY",
    name: "Biblioteca de estratégias",
    description: "Mapas e relatos de batalha transformam experiência antiga em novas vitórias.",
    icon: "▤",
    price: 1_850,
    requiredLevel: 8,
    modifiers: { training: 7, prestige: 3 },
  },
  {
    key: "CHAMPION_STATUE",
    name: "Estátua dos campeões",
    description: "Um monumento de bronze inspira visitantes e impõe respeito aos invasores.",
    icon: "♛",
    price: 2_400,
    requiredLevel: 9,
    modifiers: { prestige: 9, defence: 2 },
  },
  {
    key: "ETERNAL_FLAME",
    name: "Altar da chama eterna",
    description: "A chama do legado ilumina o Santuário e fortalece todo o domínio.",
    icon: "✦",
    price: 3_200,
    requiredLevel: 10,
    modifiers: { defence: 3, comfort: 3, supplies: 3, training: 4, prestige: 10 },
  },
] as const;

export const ARENA_SHELTER_ITEM_KEYS = ARENA_SHELTER_ITEM_CATALOG.map((item) => item.key) as [
  string,
  ...string[],
];

export function arenaShelterItem(key: string) {
  return ARENA_SHELTER_ITEM_CATALOG.find((item) => item.key === key) ?? null;
}

export function arenaShelterStats(level: number, itemKeys: readonly string[]): ArenaShelterStats {
  const safeLevel = Math.max(1, Math.min(ARENA_MAX_SHELTER_LEVEL, Math.floor(level)));
  const stats: ArenaShelterStats = {
    defence: safeLevel * 2,
    comfort: safeLevel,
    supplies: safeLevel,
    training: safeLevel,
    prestige: Math.max(0, safeLevel - 1) * 2,
  };
  for (const key of new Set(itemKeys)) {
    const item = arenaShelterItem(key);
    if (!item) continue;
    for (const [stat, value] of Object.entries(item.modifiers))
      stats[stat as ArenaShelterStatKey] += value;
  }
  return stats;
}

export function arenaShelterModifierLabels(modifiers: Partial<ArenaShelterStats>) {
  return ARENA_SHELTER_STAT_DETAILS.filter(({ key }) => modifiers[key]).map(
    ({ key, label }) => `+${modifiers[key]} ${label}`,
  );
}

const VICTORY_SHELTER_POINTS: Record<ArenaOpponent["difficulty"], number> = {
  INICIANTE: 3,
  INTERMEDIARIO: 5,
  DESAFIADOR: 8,
  CHEFE: 12,
};

export function arenaShelterStage(level: number) {
  const safeLevel = Math.max(1, Math.min(ARENA_MAX_SHELTER_LEVEL, Math.floor(level)));
  return ARENA_SHELTER_STAGES[safeLevel - 1];
}

export function arenaShelterProgress(level: number, points: number) {
  const stage = arenaShelterStage(level);
  const safePoints = Math.max(0, Math.floor(points));
  const cost = stage.upgradeCost;
  return {
    level: stage.level,
    name: stage.name,
    description: stage.description,
    points: safePoints,
    nextCost: cost,
    isMaximum: cost === null,
    canUpgrade: cost !== null && safePoints >= cost,
    progressPercentage: cost === null ? 100 : Math.min(100, Math.round((safePoints / cost) * 100)),
    nextStage: cost === null ? null : ARENA_SHELTER_STAGES[stage.level],
  };
}

export function arenaShelterPointsReward(
  difficulty: ArenaOpponent["difficulty"],
  outcome: "ACTIVE" | "WON" | "LOST" | "ABANDONED",
) {
  if (outcome === "WON") return VICTORY_SHELTER_POINTS[difficulty];
  if (outcome === "LOST") return 1;
  return 0;
}
