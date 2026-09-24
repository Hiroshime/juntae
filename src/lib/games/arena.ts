export const ARENA_STARTING_GOLD = 500;
export const ARENA_BASE_ATTRIBUTE = 1;
export const ARENA_ADDITIONAL_ATTRIBUTE_POINTS = 14;
export const ARENA_ATTRIBUTE_TOTAL = 21;
export const ARENA_MAX_STARTING_ATTRIBUTE = 8;

export const ARENA_ATTRIBUTE_KEYS = [
  "strength",
  "agility",
  "technique",
  "defence",
  "vitality",
  "presence",
  "stamina",
] as const;

export type ArenaAttributeKey = (typeof ARENA_ATTRIBUTE_KEYS)[number];
export type ArenaAttributes = Record<ArenaAttributeKey, number>;

export const ARENA_ATTRIBUTE_DETAILS: Array<{
  key: ArenaAttributeKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: "strength",
    label: "Força",
    shortLabel: "FOR",
    description: "Aumenta o dano físico e a força dos empurrões.",
  },
  {
    key: "agility",
    label: "Agilidade",
    shortLabel: "AGI",
    description: "Amplia deslocamentos e prepara futuras esquivas.",
  },
  {
    key: "technique",
    label: "Técnica",
    shortLabel: "TEC",
    description: "Melhora a precisão com armas e golpes difíceis.",
  },
  {
    key: "defence",
    label: "Defesa",
    shortLabel: "DEF",
    description: "Reduz a chance de receber ataques em cheio.",
  },
  {
    key: "vitality",
    label: "Vitalidade",
    shortLabel: "VIT",
    description: "Determina a quantidade de vida do gladiador.",
  },
  {
    key: "presence",
    label: "Presença",
    shortLabel: "PRE",
    description: "Ajuda com o público, provocações e comerciantes.",
  },
  {
    key: "stamina",
    label: "Fôlego",
    shortLabel: "FÔL",
    description: "Aumenta a energia disponível para ações intensas.",
  },
];

export const ARENA_PRONOUNS = [
  { id: "ELE_DELE", label: "ele/dele" },
  { id: "ELA_DELA", label: "ela/dela" },
  { id: "ELU_DELU", label: "elu/delu" },
] as const;

export const ARENA_ORIGINS = [
  {
    id: "PORTOS_AMBAR",
    label: "Portos de Âmbar",
    description: "Mercadores, marinheiros e duelistas acostumados a pensar rápido.",
  },
  {
    id: "TERRAS_RUBRAS",
    label: "Terras Rubras",
    description: "Planícies quentes onde resistência e coragem valem mais que títulos.",
  },
  {
    id: "ILHAS_TORMENTA",
    label: "Ilhas da Tormenta",
    description: "Um arquipélago de navegadores, acrobatas e histórias improváveis.",
  },
  {
    id: "MONTES_FERRO",
    label: "Montes de Ferro",
    description: "Fortalezas nas montanhas conhecidas por seus artesãos e guardiões.",
  },
] as const;

export const ARENA_BODY_TYPES = [
  { id: "LIGHT", label: "Leve" },
  { id: "BALANCED", label: "Equilibrado" },
  { id: "POWERFUL", label: "Imponente" },
] as const;

export const ARENA_SKIN_TONES = [
  { id: "PORCELAIN", label: "Porcelana", color: "#f4c9aa" },
  { id: "SAND", label: "Areia", color: "#dfab7d" },
  { id: "BRONZE", label: "Bronze", color: "#bd784f" },
  { id: "AMBER", label: "Âmbar", color: "#965839" },
  { id: "UMBER", label: "Terra", color: "#70422f" },
  { id: "EBONY", label: "Ébano", color: "#442a25" },
] as const;

export const ARENA_HAIR_STYLES = [
  { id: "SHAVED", label: "Raspado" },
  { id: "SHORT", label: "Curto" },
  { id: "MOHAWK", label: "Moicano" },
  { id: "CURLS", label: "Cacheado" },
  { id: "LONG", label: "Longo" },
  { id: "BRAIDS", label: "Tranças" },
] as const;

export const ARENA_HAIR_COLORS = [
  { id: "INK", label: "Ônix", color: "#211b22" },
  { id: "CHESTNUT", label: "Castanho", color: "#5f3425" },
  { id: "COPPER", label: "Cobre", color: "#a64f2f" },
  { id: "GOLD", label: "Dourado", color: "#d7a94f" },
  { id: "ASH", label: "Cinza", color: "#a69da0" },
  { id: "INDIGO", label: "Índigo", color: "#37345f" },
] as const;

export const ARENA_BEARD_STYLES = [
  { id: "NONE", label: "Sem barba" },
  { id: "STUBBLE", label: "Por fazer" },
  { id: "GOATEE", label: "Cavanhaque" },
  { id: "FULL", label: "Cheia" },
  { id: "BRAIDED", label: "Trançada" },
] as const;

export const ARENA_FACE_MARKS = [
  { id: "NONE", label: "Sem marca" },
  { id: "SCAR", label: "Cicatriz" },
  { id: "PAINT", label: "Pintura" },
  { id: "TATTOO", label: "Tatuagem" },
] as const;

export type ArenaAppearance = {
  version: 1;
  bodyType: (typeof ARENA_BODY_TYPES)[number]["id"];
  skinTone: (typeof ARENA_SKIN_TONES)[number]["id"];
  hairStyle: (typeof ARENA_HAIR_STYLES)[number]["id"];
  hairColor: (typeof ARENA_HAIR_COLORS)[number]["id"];
  beardStyle: (typeof ARENA_BEARD_STYLES)[number]["id"];
  faceMark: (typeof ARENA_FACE_MARKS)[number]["id"];
};

export const DEFAULT_ARENA_APPEARANCE: ArenaAppearance = {
  version: 1,
  bodyType: "BALANCED",
  skinTone: "BRONZE",
  hairStyle: "MOHAWK",
  hairColor: "INK",
  beardStyle: "STUBBLE",
  faceMark: "NONE",
};

export const DEFAULT_ARENA_ATTRIBUTES: ArenaAttributes = {
  strength: 3,
  agility: 3,
  technique: 3,
  defence: 3,
  vitality: 3,
  presence: 3,
  stamina: 3,
};

export function arenaAttributeTotal(attributes: ArenaAttributes) {
  return ARENA_ATTRIBUTE_KEYS.reduce((total, key) => total + attributes[key], 0);
}

export function arenaAttributePointsRemaining(attributes: ArenaAttributes) {
  return ARENA_ATTRIBUTE_TOTAL - arenaAttributeTotal(attributes);
}

export function isValidStartingArenaAttributes(attributes: ArenaAttributes) {
  return (
    arenaAttributePointsRemaining(attributes) === 0 &&
    ARENA_ATTRIBUTE_KEYS.every(
      (key) =>
        Number.isInteger(attributes[key]) &&
        attributes[key] >= ARENA_BASE_ATTRIBUTE &&
        attributes[key] <= ARENA_MAX_STARTING_ATTRIBUTE,
    )
  );
}

export function arenaDerivedStats(attributes: ArenaAttributes) {
  return {
    maxHealth: 35 + attributes.vitality * 7,
    maxEnergy: 25 + attributes.stamina * 5,
    baseDamage: 2 + attributes.strength * 2,
    accuracy: 50 + attributes.technique * 3,
    evasion: 2 + attributes.agility * 2,
    guard: 2 + attributes.defence * 2,
    crowdBonus: attributes.presence * 2,
    movement: 2 + attributes.agility,
  };
}

export function arenaOptionLabel(
  options: ReadonlyArray<{ id: string; label: string }>,
  id: string,
) {
  return options.find((option) => option.id === id)?.label ?? id;
}
