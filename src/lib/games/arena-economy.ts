import type { ArenaDerivedStats, ArenaStatModifiers } from "@/lib/games/arena";
import type { ArenaOpponent } from "@/lib/games/arena-battle";
import { arenaShelterPointsReward } from "@/lib/games/arena-shelter";

export const ARENA_SKILL_POINTS_PER_LEVEL = 2;
export const ARENA_MAX_ATTRIBUTE = 20;
export const ARENA_MAX_LEVEL = 60;
export const ARENA_MIN_FAME = -1;
export const ARENA_LOW_FAME_PENALTY = { maxEnergy: -10, accuracy: -8 } as const;

export const ARENA_EQUIPMENT_SLOTS = ["WEAPON", "ARMOUR", "HELMET", "SHIELD"] as const;
export type ArenaEquipmentSlot = (typeof ARENA_EQUIPMENT_SLOTS)[number];
export type ArenaMerchant = "FORGE" | "ARMOURY";

export type ArenaCatalogItem = {
  key: string;
  version: 1;
  name: string;
  description: string;
  icon: string;
  merchant: ArenaMerchant;
  slot: ArenaEquipmentSlot;
  price: number;
  requiredLevel: number;
  modifiers: ArenaStatModifiers;
  visualKey: string;
  visualTheme?: string;
};

const BASE_ARENA_ITEM_CATALOG = [
  {
    key: "COPPER_SHORT_SWORD",
    version: 1,
    name: "Gládio de cobre",
    description: "Lâmina equilibrada para os primeiros duelos.",
    icon: "⚔",
    merchant: "FORGE",
    slot: "WEAPON",
    price: 180,
    requiredLevel: 1,
    modifiers: { baseDamage: 2 },
    visualKey: "COPPER_SHORT_SWORD",
  },
  {
    key: "DUELIST_SPEAR",
    version: 1,
    name: "Lança da duelista",
    description: "Ponta leve que favorece dano e precisão.",
    icon: "♠",
    merchant: "FORGE",
    slot: "WEAPON",
    price: 340,
    requiredLevel: 2,
    modifiers: { baseDamage: 3, accuracy: 2 },
    visualKey: "DUELIST_SPEAR",
  },
  {
    key: "IRON_MAUL",
    version: 1,
    name: "Malho dos Montes",
    description: "Muito impacto em troca de um golpe mais difícil.",
    icon: "◆",
    merchant: "FORGE",
    slot: "WEAPON",
    price: 620,
    requiredLevel: 3,
    modifiers: { baseDamage: 5, accuracy: -2 },
    visualKey: "IRON_MAUL",
  },
  {
    key: "LEATHER_VEST",
    version: 1,
    name: "Colete de couro",
    description: "Proteção leve que amplia sua resistência.",
    icon: "◈",
    merchant: "ARMOURY",
    slot: "ARMOUR",
    price: 160,
    requiredLevel: 1,
    modifiers: { maxHealth: 8 },
    visualKey: "LEATHER_VEST",
  },
  {
    key: "BRONZE_CUIRASS",
    version: 1,
    name: "Couraça de bronze",
    description: "Proteção robusta, embora um pouco menos ágil.",
    icon: "⬟",
    merchant: "ARMOURY",
    slot: "ARMOUR",
    price: 420,
    requiredLevel: 2,
    modifiers: { maxHealth: 15, evasion: -1 },
    visualKey: "BRONZE_CUIRASS",
  },
  {
    key: "SCOUT_HELMET",
    version: 1,
    name: "Elmo do batedor",
    description: "Visão aberta para reagir mais depressa.",
    icon: "◒",
    merchant: "ARMOURY",
    slot: "HELMET",
    price: 150,
    requiredLevel: 1,
    modifiers: { evasion: 2 },
    visualKey: "SCOUT_HELMET",
  },
  {
    key: "IRON_HELMET",
    version: 1,
    name: "Elmo de ferro",
    description: "Reforça a vida e a proteção da guarda.",
    icon: "◉",
    merchant: "ARMOURY",
    slot: "HELMET",
    price: 320,
    requiredLevel: 2,
    modifiers: { maxHealth: 6, guard: 2 },
    visualKey: "IRON_HELMET",
  },
  {
    key: "OAK_BUCKLER",
    version: 1,
    name: "Broquel de carvalho",
    description: "Escudo pequeno e confiável para aparar golpes.",
    icon: "⬡",
    merchant: "ARMOURY",
    slot: "SHIELD",
    price: 180,
    requiredLevel: 1,
    modifiers: { guard: 3 },
    visualKey: "OAK_BUCKLER",
  },
  {
    key: "TOWER_SHIELD",
    version: 1,
    name: "Escudo muralha",
    description: "Defesa excepcional com menor liberdade de movimento.",
    icon: "▣",
    merchant: "ARMOURY",
    slot: "SHIELD",
    price: 480,
    requiredLevel: 3,
    modifiers: { guard: 6, movement: -1 },
    visualKey: "TOWER_SHIELD",
  },
] as const satisfies readonly ArenaCatalogItem[];

const ARENA_EQUIPMENT_TIERS = [
  {
    id: "STEEL",
    name: "Aço da Aurora",
    level: 5,
    price: 900,
    theme: "STEEL",
    names: ["Espada da Aurora", "Cota do Alvorecer", "Elmo do Vigia", "Broquel de Aço"],
  },
  {
    id: "MOON_SILVER",
    name: "Prata Lunar",
    level: 10,
    price: 1_650,
    theme: "LUNAR",
    names: ["Lança Lunar", "Couraça da Lua", "Elmo Crescente", "Escudo da Maré"],
  },
  {
    id: "LION_BRONZE",
    name: "Bronze do Leão",
    level: 15,
    price: 2_350,
    theme: "LION",
    names: ["Gládio do Leão", "Loriga Leonina", "Juba de Bronze", "Égide do Leão"],
  },
  {
    id: "OBSIDIAN",
    name: "Obsidiana Rubra",
    level: 20,
    price: 3_100,
    theme: "OBSIDIAN",
    names: ["Machado de Obsidiana", "Carapaça Rubra", "Coroa Vulcânica", "Muralha Magmática"],
  },
  {
    id: "TEMPEST_CRYSTAL",
    name: "Cristal da Tormenta",
    level: 25,
    price: 4_000,
    theme: "TEMPEST",
    names: ["Tridente da Tormenta", "Malha de Cristal", "Elmo do Trovão", "Escudo da Monção"],
  },
  {
    id: "STORM",
    name: "Tempestade",
    level: 30,
    price: 4_900,
    theme: "STORM",
    names: ["Lâmina-Relâmpago", "Couraça da Tempestade", "Elmo Corta-Vento", "Égide do Trovão"],
  },
  {
    id: "IMPERIAL_EMERALD",
    name: "Esmeralda Imperial",
    level: 35,
    price: 5_950,
    theme: "EMERALD",
    names: ["Alabarda Esmeralda", "Armadura Imperial", "Coroa da Selva", "Baluarte Esmeralda"],
  },
  {
    id: "SOLAR",
    name: "Solar Real",
    level: 40,
    price: 7_100,
    theme: "SOLAR",
    names: ["Espada do Meio-Dia", "Armadura Solar", "Diadema Real", "Escudo Helianto"],
  },
  {
    id: "ECLIPSE",
    name: "Eclipse Negro",
    level: 45,
    price: 8_350,
    theme: "ECLIPSE",
    names: ["Foice do Eclipse", "Manto de Aço Negro", "Elmo Sem-Luz", "Escudo Penumbra"],
  },
  {
    id: "COLOSSUS",
    name: "Colosso",
    level: 50,
    price: 9_700,
    theme: "COLOSSUS",
    names: ["Malho do Colosso", "Placas Titânicas", "Elmo da Montanha", "Muralha Titânica"],
  },
  {
    id: "ASTRAL",
    name: "Astral",
    level: 55,
    price: 11_200,
    theme: "ASTRAL",
    names: ["Lança das Estrelas", "Vestes Astrais", "Coroa Celeste", "Égide do Firmamento"],
  },
  {
    id: "ETERNAL",
    name: "Lenda Eterna",
    level: 60,
    price: 12_800,
    theme: "ETERNAL",
    names: ["Lâmina da Eternidade", "Armadura da Lenda", "Coroa Imortal", "Escudo do Legado"],
  },
] as const;

const WEAPON_VISUALS = ["COPPER_SHORT_SWORD", "DUELIST_SPEAR", "IRON_MAUL"] as const;
const ARMOUR_VISUALS = ["LEATHER_VEST", "BRONZE_CUIRASS"] as const;
const HELMET_VISUALS = ["SCOUT_HELMET", "IRON_HELMET"] as const;
const SHIELD_VISUALS = ["OAK_BUCKLER", "TOWER_SHIELD"] as const;

const PROGRESSION_ARENA_ITEMS: ArenaCatalogItem[] = ARENA_EQUIPMENT_TIERS.flatMap((tier, index) => {
  const rank = index + 1;
  return [
    {
      key: `${tier.id}_WEAPON`,
      version: 1,
      name: tier.names[0],
      description: `Arma de categoria ${tier.name}, criada para campeões de nível ${tier.level}.`,
      icon: index % 3 === 1 ? "♠" : index % 3 === 2 ? "◆" : "⚔",
      merchant: "FORGE",
      slot: "WEAPON",
      price: tier.price,
      requiredLevel: tier.level,
      modifiers: { baseDamage: 4 + rank * 3, accuracy: Math.ceil(rank / 2) },
      visualKey: WEAPON_VISUALS[index % WEAPON_VISUALS.length],
      visualTheme: tier.theme,
    },
    {
      key: `${tier.id}_ARMOUR`,
      version: 1,
      name: tier.names[1],
      description: `Proteção completa de categoria ${tier.name}.`,
      icon: "⬟",
      merchant: "ARMOURY",
      slot: "ARMOUR",
      price: Math.round(tier.price * 0.92),
      requiredLevel: tier.level,
      modifiers: { maxHealth: 12 + rank * 12, guard: rank },
      visualKey: ARMOUR_VISUALS[index % ARMOUR_VISUALS.length],
      visualTheme: tier.theme,
    },
    {
      key: `${tier.id}_HELMET`,
      version: 1,
      name: tier.names[2],
      description: `Elmo de categoria ${tier.name} com visão e proteção aprimoradas.`,
      icon: "◉",
      merchant: "ARMOURY",
      slot: "HELMET",
      price: Math.round(tier.price * 0.58),
      requiredLevel: tier.level,
      modifiers: {
        maxHealth: 6 + rank * 4,
        accuracy: 2 + rank,
        evasion: Math.ceil(rank / 2),
      },
      visualKey: HELMET_VISUALS[index % HELMET_VISUALS.length],
      visualTheme: tier.theme,
    },
    {
      key: `${tier.id}_SHIELD`,
      version: 1,
      name: tier.names[3],
      description: `Escudo de categoria ${tier.name} para enfrentar as ligas superiores.`,
      icon: "▣",
      merchant: "ARMOURY",
      slot: "SHIELD",
      price: Math.round(tier.price * 0.72),
      requiredLevel: tier.level,
      modifiers: { guard: 6 + rank * 2, maxHealth: rank * 5 },
      visualKey: SHIELD_VISUALS[index % SHIELD_VISUALS.length],
      visualTheme: tier.theme,
    },
  ] satisfies ArenaCatalogItem[];
});

export const ARENA_ITEM_CATALOG: readonly ArenaCatalogItem[] = [
  ...BASE_ARENA_ITEM_CATALOG,
  ...PROGRESSION_ARENA_ITEMS,
];

export const ARENA_CATALOG_KEYS = ARENA_ITEM_CATALOG.map((item) => item.key) as [
  string,
  ...string[],
];

export function arenaCatalogItem(key: string) {
  return ARENA_ITEM_CATALOG.find((item) => item.key === key) ?? null;
}

export function arenaEquipmentModifiers(keys: readonly string[]): ArenaStatModifiers {
  const modifiers: ArenaStatModifiers = {};
  for (const key of keys) {
    const item = arenaCatalogItem(key);
    if (!item) continue;
    for (const [stat, amount] of Object.entries(item.modifiers)) {
      const typedStat = stat as keyof ArenaDerivedStats;
      modifiers[typedStat] = (modifiers[typedStat] ?? 0) + (amount ?? 0);
    }
  }
  return modifiers;
}

export function arenaEquipmentSetForLevel(level: number) {
  const safeLevel = Math.max(1, Math.min(ARENA_MAX_LEVEL, Math.floor(level)));
  return ARENA_EQUIPMENT_SLOTS.map(
    (slot) =>
      ARENA_ITEM_CATALOG.filter(
        (item) => item.slot === slot && item.requiredLevel <= safeLevel,
      ).sort(
        (left, right) => right.requiredLevel - left.requiredLevel || right.price - left.price,
      )[0],
  )
    .filter((item): item is ArenaCatalogItem => Boolean(item))
    .map((item) => item.key);
}

export function arenaExperienceForLevel(level: number) {
  const safeLevel = Math.max(1, Math.floor(level));
  return 75 * safeLevel * (safeLevel - 1);
}

export function arenaLevelForExperience(experience: number) {
  const safeExperience = Math.max(0, Math.floor(experience));
  let level = 1;
  while (level < ARENA_MAX_LEVEL && safeExperience >= arenaExperienceForLevel(level + 1))
    level += 1;
  return level;
}

export function arenaProgressAfterExperience(currentLevel: number, totalExperience: number) {
  const level = Math.max(currentLevel, arenaLevelForExperience(totalExperience));
  const levelsGained = level - currentLevel;
  return {
    level,
    levelsGained,
    skillPointsGained: levelsGained * ARENA_SKILL_POINTS_PER_LEVEL,
    currentLevelExperience: arenaExperienceForLevel(level),
    nextLevelExperience: arenaExperienceForLevel(level + 1),
  };
}

export function arenaFameChange(currentFame: number, requestedChange: number) {
  return Math.max(ARENA_MIN_FAME, currentFame + requestedChange) - currentFame;
}

export function arenaLowFamePenalty(fame: number) {
  return fame <= ARENA_MIN_FAME ? ARENA_LOW_FAME_PENALTY : null;
}

const VICTORY_REWARDS: Record<
  ArenaOpponent["difficulty"],
  { gold: number; experience: number; fame: number }
> = {
  INICIANTE: { gold: 90, experience: 60, fame: 2 },
  INTERMEDIARIO: { gold: 150, experience: 90, fame: 4 },
  DESAFIADOR: { gold: 240, experience: 130, fame: 7 },
  CHEFE: { gold: 450, experience: 220, fame: 15 },
};

export function arenaBattleReward(
  difficulty: ArenaOpponent["difficulty"],
  outcome: "ACTIVE" | "WON" | "LOST" | "ABANDONED",
  opponentLevel = 1,
  progressive = false,
  opponentLeague = 1,
) {
  const shelterPoints = arenaShelterPointsReward(difficulty, outcome);
  if (outcome === "WON") {
    if (!progressive) return { ...VICTORY_REWARDS[difficulty], shelterPoints };
    const level = Math.max(1, Math.min(ARENA_MAX_LEVEL, Math.floor(opponentLevel)));
    return {
      gold: VICTORY_REWARDS[difficulty].gold + level * 55,
      experience: level * 220,
      fame: VICTORY_REWARDS[difficulty].fame + Math.ceil(level / 3),
      shelterPoints,
    };
  }
  if (outcome === "LOST")
    return {
      gold: 0,
      experience: progressive ? Math.max(15, Math.floor(opponentLevel) * 25) : 15,
      fame: opponentLeague >= 6 ? -1 : 0,
      shelterPoints,
    };
  return {
    gold: 0,
    experience: 0,
    fame: outcome === "ABANDONED" && opponentLeague >= 6 ? -1 : 0,
    shelterPoints,
  };
}

export function arenaModifierLabels(modifiers: ArenaStatModifiers) {
  const labels: Record<keyof ArenaDerivedStats, string> = {
    maxHealth: "vida",
    maxEnergy: "energia",
    baseDamage: "dano",
    accuracy: "precisão",
    evasion: "esquiva",
    guard: "guarda",
    crowdBonus: "público",
    movement: "movimento",
  };
  return Object.entries(modifiers).map(([stat, amount]) => {
    const value = amount ?? 0;
    return `${value >= 0 ? "+" : ""}${value} ${labels[stat as keyof ArenaDerivedStats]}`;
  });
}
