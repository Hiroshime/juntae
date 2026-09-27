import { arenaDerivedStats, type ArenaAppearance, type ArenaAttributes } from "@/lib/games/arena";
import {
  ARENA_MAX_LEVEL,
  arenaEquipmentModifiers,
  arenaEquipmentSetForLevel,
} from "@/lib/games/arena-economy";

export const ARENA_BATTLE_ACTIONS = [
  "ADVANCE",
  "RETREAT",
  "QUICK_STRIKE",
  "POWER_STRIKE",
  "GUARD",
  "RECOVER",
] as const;

export type ArenaBattleAction = (typeof ARENA_BATTLE_ACTIONS)[number];
export type ArenaBattleActor = "PLAYER" | "OPPONENT";
export type ArenaAiStyle = "BALANCED" | "AGGRESSIVE" | "TACTICAL";

export const ARENA_ACTION_DETAILS: Record<
  ArenaBattleAction,
  { label: string; shortLabel: string; description: string; energy: number; range?: number }
> = {
  ADVANCE: {
    label: "Avançar",
    shortLabel: "Avançar",
    description: "Aproxime-se conforme sua agilidade e recupere um pouco de energia.",
    energy: 0,
  },
  RETREAT: {
    label: "Recuar",
    shortLabel: "Recuar",
    description: "Abra distância e recupere um pouco de energia.",
    energy: 0,
  },
  QUICK_STRIKE: {
    label: "Golpe rápido",
    shortLabel: "Rápido",
    description: "Ataque confiável que alcança até duas casas.",
    energy: 4,
    range: 2,
  },
  POWER_STRIKE: {
    label: "Golpe pesado",
    shortLabel: "Pesado",
    description: "Ataque forte de curto alcance que pode empurrar o adversário.",
    energy: 10,
    range: 1,
  },
  GUARD: {
    label: "Firmar guarda",
    shortLabel: "Guarda",
    description: "Reduz o próximo dano recebido e recupera energia.",
    energy: 0,
  },
  RECOVER: {
    label: "Recuperar fôlego",
    shortLabel: "Fôlego",
    description: "Recupere bastante energia, mas sem proteção adicional.",
    energy: 0,
  },
};

export type ArenaCombatantSnapshot = {
  name: string;
  level?: number;
  appearance: ArenaAppearance;
  equipment?: readonly string[];
  famePenalty?: { maxEnergy: number; accuracy: number } | null;
  attributes: ArenaAttributes;
  derived: ReturnType<typeof arenaDerivedStats>;
  style: ArenaAiStyle;
  intro: string;
};

export type ArenaOpponent = ArenaCombatantSnapshot & {
  key: string;
  level: number;
  title: string;
  difficulty: "INICIANTE" | "INTERMEDIARIO" | "DESAFIADOR" | "CHEFE";
  procedural: boolean;
};

function opponent(
  input: Omit<ArenaOpponent, "derived" | "procedural"> & { attributes: ArenaAttributes },
): ArenaOpponent {
  return { ...input, procedural: false, derived: arenaDerivedStats(input.attributes) };
}

export const ARENA_OPPONENTS = [
  opponent({
    key: "CAIO_DO_PATIO",
    level: 1,
    name: "Caio do Pátio",
    title: "Recruta da Vila do Sol",
    difficulty: "INICIANTE",
    style: "BALANCED",
    intro: "Vamos descobrir se seus passos acompanham sua coragem.",
    equipment: ["COPPER_SHORT_SWORD", "LEATHER_VEST", "OAK_BUCKLER"],
    appearance: {
      version: 1,
      bodyType: "BALANCED",
      skinTone: "SAND",
      hairStyle: "SHORT",
      hairColor: "CHESTNUT",
      beardStyle: "STUBBLE",
      faceMark: "NONE",
    },
    attributes: {
      strength: 2,
      agility: 2,
      technique: 2,
      defence: 2,
      vitality: 2,
      presence: 2,
      stamina: 2,
    },
  }),
  opponent({
    key: "NARA_VENTO_DE_COBRE",
    level: 2,
    name: "Nara Vento de Cobre",
    title: "Duelista das Ilhas",
    difficulty: "INTERMEDIARIO",
    style: "TACTICAL",
    intro: "Distância é uma arma. Tente me alcançar.",
    equipment: ["DUELIST_SPEAR", "SCOUT_HELMET"],
    appearance: {
      version: 1,
      bodyType: "LIGHT",
      skinTone: "BRONZE",
      hairStyle: "BRAIDS",
      hairColor: "COPPER",
      beardStyle: "NONE",
      faceMark: "PAINT",
    },
    attributes: {
      strength: 2,
      agility: 5,
      technique: 4,
      defence: 2,
      vitality: 2,
      presence: 2,
      stamina: 3,
    },
  }),
  opponent({
    key: "BORIN_MURALHA",
    level: 3,
    name: "Borin Muralha",
    title: "Guardião dos Montes de Ferro",
    difficulty: "DESAFIADOR",
    style: "AGGRESSIVE",
    intro: "Quando o portão fechar, só um de nós continuará de pé.",
    equipment: ["IRON_MAUL", "BRONZE_CUIRASS", "IRON_HELMET", "TOWER_SHIELD"],
    appearance: {
      version: 1,
      bodyType: "POWERFUL",
      skinTone: "UMBER",
      hairStyle: "MOHAWK",
      hairColor: "ASH",
      beardStyle: "BRAIDED",
      faceMark: "SCAR",
    },
    attributes: {
      strength: 5,
      agility: 2,
      technique: 3,
      defence: 5,
      vitality: 4,
      presence: 2,
      stamina: 3,
    },
  }),
  opponent({
    key: "AURELIA_CAMPEA_SOLAR",
    level: 5,
    name: "Aurélia, Campeã Solar",
    title: "Soberana invicta do Coliseu",
    difficulty: "CHEFE",
    style: "TACTICAL",
    intro: "Três portões trouxeram você até mim. O último se abre com aço.",
    equipment: ["DUELIST_SPEAR", "BRONZE_CUIRASS", "IRON_HELMET", "TOWER_SHIELD"],
    appearance: {
      version: 1,
      bodyType: "POWERFUL",
      skinTone: "BRONZE",
      hairStyle: "LONG",
      hairColor: "GOLD",
      beardStyle: "NONE",
      faceMark: "TATTOO",
    },
    attributes: {
      strength: 7,
      agility: 5,
      technique: 7,
      defence: 7,
      vitality: 7,
      presence: 6,
      stamina: 7,
    },
  }),
] as const satisfies readonly ArenaOpponent[];

export const ARENA_CAMPAIGN_LENGTH = ARENA_OPPONENTS.length;

const PROCEDURAL_FIRST_NAMES = [
  "Aelia",
  "Cassian",
  "Dara",
  "Eron",
  "Fausta",
  "Galen",
  "Iria",
  "Jarek",
  "Kaela",
  "Lucan",
  "Mira",
  "Nério",
  "Orla",
  "Petra",
  "Ravi",
  "Sora",
] as const;

const PROCEDURAL_EPITHETS = [
  "Lâmina Âmbar",
  "Passo da Tormenta",
  "Punho de Ferro",
  "Olhar Escarlate",
  "Guardião do Poente",
  "Voz das Ruínas",
  "Escudo Lunar",
  "Fúria do Norte",
  "Sombra Solar",
  "Coração de Bronze",
  "Vento Rubro",
  "Sentinela do Sal",
  "Martelo Cinzento",
  "Flecha do Deserto",
  "Eco da Montanha",
  "Campeão da Aurora",
] as const;

const PROCEDURAL_TITLES = [
  "Desafiante dos portos distantes",
  "Veterano das arenas provinciais",
  "Mercenária da estrada rubra",
  "Guardião de uma fortaleza esquecida",
  "Duelista das ilhas exteriores",
  "Campeão de uma liga estrangeira",
] as const;

const PROCEDURAL_INTROS = [
  "Sua fama chegou antes de você. Vamos descobrir se ela merece permanecer.",
  "Cada degrau desta liga foi pago com cicatrizes.",
  "A multidão quer uma lenda. Hoje ela verá apenas um vencedor.",
  "Seu equipamento é forte; sua disciplina ainda será provada.",
  "Não existe caminho fácil depois destes portões.",
  "Eu estudei suas vitórias. Agora mostrarei suas fraquezas.",
] as const;

const PROCEDURAL_DIFFICULTIES = ["INICIANTE", "INTERMEDIARIO", "DESAFIADOR", "CHEFE"] as const;
const PROCEDURAL_STYLES = ["BALANCED", "TACTICAL", "AGGRESSIVE", "TACTICAL"] as const;

function proceduralAttribute(value: number) {
  return Math.max(1, Math.min(20, Math.floor(value)));
}

function generatedArenaOpponent(completions: number, step: number): ArenaOpponent {
  const safeCompletions = Math.max(1, Math.floor(completions));
  const safeStep = Math.max(0, Math.min(ARENA_CAMPAIGN_LENGTH - 1, Math.floor(step)));
  const seed = safeCompletions * ARENA_CAMPAIGN_LENGTH + safeStep;
  const level = Math.min(ARENA_MAX_LEVEL, safeCompletions * 4 + safeStep + 2);
  const base = 3 + Math.floor((level - 1) / 4);
  const style = PROCEDURAL_STYLES[safeStep];
  const attributes: ArenaAttributes = {
    strength: proceduralAttribute(base + (style === "AGGRESSIVE" ? 2 : safeStep === 3 ? 3 : 0)),
    agility: proceduralAttribute(base + (style === "TACTICAL" ? 2 : 0)),
    technique: proceduralAttribute(base + (style === "TACTICAL" ? 2 : safeStep === 3 ? 2 : 0)),
    defence: proceduralAttribute(base + (safeStep >= 2 ? 2 : 0)),
    vitality: proceduralAttribute(base + (safeStep >= 2 ? 2 : 0)),
    presence: proceduralAttribute(base + safeStep),
    stamina: proceduralAttribute(base + (style === "AGGRESSIVE" ? 2 : safeStep === 3 ? 2 : 0)),
  };
  const equipment = arenaEquipmentSetForLevel(level);
  const appearance: ArenaAppearance = {
    version: 1,
    bodyType: (["BALANCED", "LIGHT", "POWERFUL"] as const)[seed % 3],
    skinTone: (["SAND", "BRONZE", "AMBER", "UMBER", "EBONY", "PORCELAIN"] as const)[(seed * 5) % 6],
    hairStyle: (["SHORT", "MOHAWK", "CURLS", "LONG", "BRAIDS", "SHAVED"] as const)[(seed * 7) % 6],
    hairColor: (["INK", "CHESTNUT", "COPPER", "GOLD", "ASH", "INDIGO"] as const)[(seed * 11) % 6],
    beardStyle: (["NONE", "STUBBLE", "GOATEE", "FULL", "BRAIDED"] as const)[(seed * 3) % 5],
    faceMark: (["NONE", "SCAR", "PAINT", "TATTOO"] as const)[(seed * 5) % 4],
  };
  return {
    key: `CHALLENGER_C${safeCompletions}_S${safeStep}`,
    level,
    name: `${PROCEDURAL_FIRST_NAMES[seed % PROCEDURAL_FIRST_NAMES.length]} ${PROCEDURAL_EPITHETS[(Math.floor(seed / PROCEDURAL_FIRST_NAMES.length) + safeStep * 3) % PROCEDURAL_EPITHETS.length]}`,
    title:
      safeStep === ARENA_CAMPAIGN_LENGTH - 1
        ? `Campeão da Liga ${safeCompletions + 1}`
        : PROCEDURAL_TITLES[(seed * 5) % PROCEDURAL_TITLES.length],
    difficulty: PROCEDURAL_DIFFICULTIES[safeStep],
    procedural: true,
    style,
    intro: PROCEDURAL_INTROS[(seed * 11) % PROCEDURAL_INTROS.length],
    equipment,
    appearance,
    attributes,
    derived: arenaDerivedStats(attributes, arenaEquipmentModifiers(equipment)),
  };
}

export function arenaCampaignOpponents(completions: number): readonly ArenaOpponent[] {
  const safeCompletions = Math.max(0, Math.floor(completions));
  if (safeCompletions === 0) return ARENA_OPPONENTS;
  return Array.from({ length: ARENA_CAMPAIGN_LENGTH }, (_, step) =>
    generatedArenaOpponent(safeCompletions, step),
  );
}

export function arenaPreviousLeagueOpponents(completions: number): readonly ArenaOpponent[] {
  const safeCompletions = Math.max(0, Math.floor(completions));
  return safeCompletions > 0 ? arenaCampaignOpponents(safeCompletions - 1) : [];
}

export function arenaAccessibleCampaignOpponents(completions: number): readonly ArenaOpponent[] {
  return [...arenaCampaignOpponents(completions), ...arenaPreviousLeagueOpponents(completions)];
}

export function arenaCampaignOpponent(step: number, completions = 0) {
  const safeStep = Math.max(0, Math.min(ARENA_CAMPAIGN_LENGTH - 1, Math.floor(step)));
  return arenaCampaignOpponents(completions)[safeStep];
}

export function arenaOpponentCampaignStep(key: string, completions?: number) {
  const opponents =
    completions === undefined
      ? key.startsWith("CHALLENGER_C")
        ? [arenaOpponent(key)].filter((entry): entry is ArenaOpponent => Boolean(entry))
        : ARENA_OPPONENTS
      : arenaCampaignOpponents(completions);
  const step = opponents.findIndex((entry) => entry.key === key);
  if (completions === undefined && key.startsWith("CHALLENGER_C")) {
    const match = /^CHALLENGER_C\d+_S([0-3])$/.exec(key);
    return match ? Number(match[1]) : null;
  }
  return step < 0 ? null : step;
}

export function arenaCampaignProgress(step: number, completions: number) {
  const safeCompletions = Math.max(0, Math.floor(completions));
  const opponents = arenaCampaignOpponents(safeCompletions);
  const previousOpponents = arenaPreviousLeagueOpponents(safeCompletions);
  const opponent = arenaCampaignOpponent(step, safeCompletions);
  return {
    step: Math.max(0, Math.min(ARENA_CAMPAIGN_LENGTH - 1, Math.floor(step))),
    totalSteps: ARENA_CAMPAIGN_LENGTH,
    completions: safeCompletions,
    league: safeCompletions + 1,
    opponentKey: opponent.key,
    opponentName: opponent.name,
    isBoss: opponent.difficulty === "CHEFE",
    opponents,
    previousLeague:
      previousOpponents.length > 0
        ? { league: safeCompletions, opponents: previousOpponents }
        : null,
  };
}

export function arenaOpponent(key: string) {
  const fixed = ARENA_OPPONENTS.find((entry) => entry.key === key);
  if (fixed) return fixed;
  const match = /^CHALLENGER_C(\d+)_S([0-3])$/.exec(key);
  return match ? generatedArenaOpponent(Number(match[1]), Number(match[2])) : null;
}

export function arenaOpponentLeague(key: string) {
  if (ARENA_OPPONENTS.some((entry) => entry.key === key)) return 1;
  const match = /^CHALLENGER_C(\d+)_S[0-3]$/.exec(key);
  return match ? Number(match[1]) + 1 : null;
}

export type ArenaBattleState = {
  round: number;
  playerHealth: number;
  playerEnergy: number;
  playerPosition: number;
  playerGuarded: boolean;
  opponentHealth: number;
  opponentEnergy: number;
  opponentPosition: number;
  opponentGuarded: boolean;
};

export type ArenaBattleEvent = {
  actor: ArenaBattleActor;
  kind: "MOVE" | "HIT" | "MISS" | "GUARD" | "RECOVER" | "KNOCKOUT";
  message: string;
  amount?: number;
};

export type ArenaRoundResult = {
  state: ArenaBattleState;
  opponentAction: ArenaBattleAction;
  actingFirst: ArenaBattleActor;
  events: ArenaBattleEvent[];
  outcome: "ACTIVE" | "WON" | "LOST";
};

type RandomSource = () => number;

export function arenaBattleDistance(state: ArenaBattleState) {
  return state.opponentPosition - state.playerPosition;
}

function movement(snapshot: ArenaCombatantSnapshot) {
  return Math.max(1, Math.min(3, Math.ceil(snapshot.derived.movement / 3)));
}

function healthFor(state: ArenaBattleState, actor: ArenaBattleActor) {
  return actor === "PLAYER" ? state.playerHealth : state.opponentHealth;
}

function energyFor(state: ArenaBattleState, actor: ArenaBattleActor) {
  return actor === "PLAYER" ? state.playerEnergy : state.opponentEnergy;
}

function actorSnapshot(
  actor: ArenaBattleActor,
  player: ArenaCombatantSnapshot,
  opponentSnapshot: ArenaCombatantSnapshot,
) {
  return actor === "PLAYER" ? player : opponentSnapshot;
}

export function arenaActionUnavailableReason(
  state: ArenaBattleState,
  actor: ArenaBattleActor,
  action: ArenaBattleAction,
) {
  const detail = ARENA_ACTION_DETAILS[action];
  if (healthFor(state, actor) <= 0) return "O combatente já foi derrotado.";
  if (energyFor(state, actor) < detail.energy) return "Energia insuficiente.";
  const distance = arenaBattleDistance(state);
  if (detail.range && distance > detail.range) return "Adversário fora de alcance.";
  if (action === "ADVANCE" && distance <= 1) return "Você já está junto do adversário.";
  if (action === "RETREAT") {
    if (actor === "PLAYER" && state.playerPosition === 0) return "Não há espaço para recuar.";
    if (actor === "OPPONENT" && state.opponentPosition === 10) return "Não há espaço para recuar.";
  }
  return null;
}

export function arenaAvailableActions(state: ArenaBattleState, actor: ArenaBattleActor) {
  return ARENA_BATTLE_ACTIONS.filter(
    (action) => !arenaActionUnavailableReason(state, actor, action),
  );
}

function boundedRoll(random: RandomSource, minimum: number, maximum: number) {
  return minimum + Math.floor(Math.min(0.999999, Math.max(0, random())) * (maximum - minimum + 1));
}

function chooseOpponentAction(
  state: ArenaBattleState,
  snapshot: ArenaCombatantSnapshot,
  random: RandomSource,
): ArenaBattleAction {
  const available = new Set(arenaAvailableActions(state, "OPPONENT"));
  const distance = arenaBattleDistance(state);
  const healthRatio = state.opponentHealth / snapshot.derived.maxHealth;

  if (state.opponentEnergy < 4 && available.has("RECOVER")) return "RECOVER";
  if (distance > 2 && available.has("ADVANCE")) return "ADVANCE";
  if (healthRatio <= 0.35 && random() < 0.32 && available.has("GUARD")) return "GUARD";
  if (
    distance === 1 &&
    available.has("POWER_STRIKE") &&
    (snapshot.style === "AGGRESSIVE" || random() < 0.38)
  )
    return "POWER_STRIKE";
  if (
    snapshot.style === "TACTICAL" &&
    distance === 1 &&
    random() < 0.22 &&
    available.has("RETREAT")
  )
    return "RETREAT";
  if (available.has("QUICK_STRIKE")) return "QUICK_STRIKE";
  if (available.has("GUARD") && random() < 0.35) return "GUARD";
  return available.has("ADVANCE") ? "ADVANCE" : "RECOVER";
}

function executeAction(
  state: ArenaBattleState,
  actor: ArenaBattleActor,
  action: ArenaBattleAction,
  player: ArenaCombatantSnapshot,
  opponentSnapshot: ArenaCombatantSnapshot,
  random: RandomSource,
  events: ArenaBattleEvent[],
) {
  const attacker = actorSnapshot(actor, player, opponentSnapshot);
  const defender = actorSnapshot(
    actor === "PLAYER" ? "OPPONENT" : "PLAYER",
    player,
    opponentSnapshot,
  );
  const name = attacker.name;

  if (actor === "PLAYER") state.playerGuarded = action === "GUARD";
  else state.opponentGuarded = action === "GUARD";

  if (action === "ADVANCE" || action === "RETREAT") {
    const step = movement(attacker);
    const before = actor === "PLAYER" ? state.playerPosition : state.opponentPosition;
    if (actor === "PLAYER")
      state.playerPosition =
        action === "ADVANCE"
          ? Math.min(state.opponentPosition - 1, state.playerPosition + step)
          : Math.max(0, state.playerPosition - step);
    else
      state.opponentPosition =
        action === "ADVANCE"
          ? Math.max(state.playerPosition + 1, state.opponentPosition - step)
          : Math.min(10, state.opponentPosition + step);
    const after = actor === "PLAYER" ? state.playerPosition : state.opponentPosition;
    const restored = 3;
    if (actor === "PLAYER")
      state.playerEnergy = Math.min(attacker.derived.maxEnergy, state.playerEnergy + restored);
    else
      state.opponentEnergy = Math.min(attacker.derived.maxEnergy, state.opponentEnergy + restored);
    events.push({
      actor,
      kind: "MOVE",
      message: `${name} ${action === "ADVANCE" ? "avançou" : "recuou"} ${Math.abs(after - before)} casa${Math.abs(after - before) === 1 ? "" : "s"}.`,
      amount: Math.abs(after - before),
    });
    return;
  }

  if (action === "GUARD") {
    const restored = 5;
    if (actor === "PLAYER")
      state.playerEnergy = Math.min(attacker.derived.maxEnergy, state.playerEnergy + restored);
    else
      state.opponentEnergy = Math.min(attacker.derived.maxEnergy, state.opponentEnergy + restored);
    events.push({ actor, kind: "GUARD", message: `${name} firmou a guarda.` });
    return;
  }

  if (action === "RECOVER") {
    const restored = Math.max(10, attacker.attributes.stamina * 2 + 6);
    if (actor === "PLAYER")
      state.playerEnergy = Math.min(attacker.derived.maxEnergy, state.playerEnergy + restored);
    else
      state.opponentEnergy = Math.min(attacker.derived.maxEnergy, state.opponentEnergy + restored);
    events.push({
      actor,
      kind: "RECOVER",
      message: `${name} recuperou o fôlego.`,
      amount: restored,
    });
    return;
  }

  const detail = ARENA_ACTION_DETAILS[action];
  if (actor === "PLAYER") state.playerEnergy -= detail.energy;
  else state.opponentEnergy -= detail.energy;

  if (detail.range && arenaBattleDistance(state) > detail.range) {
    events.push({
      actor,
      kind: "MISS",
      message: `${name} atacou, mas o adversário já estava fora de alcance.`,
    });
    return;
  }

  const power = action === "POWER_STRIKE";
  const hitChance = Math.max(
    30,
    Math.min(95, attacker.derived.accuracy + (power ? 2 : 15) - defender.derived.evasion),
  );
  if (random() * 100 >= hitChance) {
    events.push({ actor, kind: "MISS", message: `${name} errou o ${detail.label.toLowerCase()}.` });
    return;
  }

  let damage = Math.max(
    1,
    Math.round(attacker.derived.baseDamage * (power ? 1.65 : 0.85)) + boundedRoll(random, -1, 2),
  );
  const defenderGuarded = actor === "PLAYER" ? state.opponentGuarded : state.playerGuarded;
  if (defenderGuarded) {
    const reduction = Math.min(0.68, 0.35 + defender.derived.guard * 0.015);
    damage = Math.max(1, Math.round(damage * (1 - reduction)));
    if (actor === "PLAYER") state.opponentGuarded = false;
    else state.playerGuarded = false;
  }

  if (actor === "PLAYER") state.opponentHealth = Math.max(0, state.opponentHealth - damage);
  else state.playerHealth = Math.max(0, state.playerHealth - damage);
  events.push({
    actor,
    kind: "HIT",
    message: `${name} acertou ${detail.label.toLowerCase()} e causou ${damage} de dano${defenderGuarded ? " contra a guarda" : ""}.`,
    amount: damage,
  });

  if (power && arenaBattleDistance(state) > 0) {
    if (actor === "PLAYER") state.opponentPosition = Math.min(10, state.opponentPosition + 1);
    else state.playerPosition = Math.max(0, state.playerPosition - 1);
  }
}

export function resolveArenaRound(
  current: ArenaBattleState,
  player: ArenaCombatantSnapshot,
  opponentSnapshot: ArenaCombatantSnapshot,
  playerAction: ArenaBattleAction,
  random: RandomSource = Math.random,
): ArenaRoundResult {
  const reason = arenaActionUnavailableReason(current, "PLAYER", playerAction);
  if (reason) throw new Error(reason);
  const state = { ...current };
  const opponentAction = chooseOpponentAction(state, opponentSnapshot, random);
  const actingFirst: ArenaBattleActor =
    player.attributes.agility > opponentSnapshot.attributes.agility ||
    (player.attributes.agility === opponentSnapshot.attributes.agility && state.round % 2 === 1)
      ? "PLAYER"
      : "OPPONENT";
  const order: ArenaBattleActor[] =
    actingFirst === "PLAYER" ? ["PLAYER", "OPPONENT"] : ["OPPONENT", "PLAYER"];
  const events: ArenaBattleEvent[] = [];

  for (const actor of order) {
    if (state.playerHealth <= 0 || state.opponentHealth <= 0) break;
    executeAction(
      state,
      actor,
      actor === "PLAYER" ? playerAction : opponentAction,
      player,
      opponentSnapshot,
      random,
      events,
    );
  }

  const outcome = state.opponentHealth <= 0 ? "WON" : state.playerHealth <= 0 ? "LOST" : "ACTIVE";
  if (outcome !== "ACTIVE") {
    const winner = outcome === "WON" ? player.name : opponentSnapshot.name;
    events.push({
      actor: outcome === "WON" ? "PLAYER" : "OPPONENT",
      kind: "KNOCKOUT",
      message: `${winner} venceu o duelo!`,
    });
  }
  return { state, opponentAction, actingFirst, events, outcome };
}
