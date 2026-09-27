import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { arenaDerivedStats, ARENA_ATTRIBUTE_KEYS } from "@/lib/games/arena";
import {
  ARENA_BATTLE_ACTIONS,
  ARENA_CAMPAIGN_LENGTH,
  arenaAccessibleCampaignOpponents,
  arenaActionUnavailableReason,
  arenaBattleDistance,
  arenaCampaignOpponent,
  arenaCampaignOpponents,
  arenaOpponent,
  arenaOpponentCampaignStep,
  arenaOpponentLeague,
  resolveArenaRound,
  type ArenaBattleEvent,
  type ArenaBattleState,
  type ArenaCombatantSnapshot,
} from "@/lib/games/arena-battle";
import {
  ARENA_CATALOG_KEYS,
  arenaBattleReward,
  arenaEquipmentModifiers,
  arenaFameChange,
  arenaLowFamePenalty,
  arenaProgressAfterExperience,
} from "@/lib/games/arena-economy";
import {
  arenaAppearanceSchema,
  arenaBattleActionSchema,
  startArenaBattleSchema,
  type ArenaBattleActionInput,
  type StartArenaBattleInput,
} from "@/lib/validation/arena";
import { AppError, assertFound } from "@/server/errors";
import { assertArenaGladiatorAvailable } from "@/server/services/arena-availability";
import {
  arenaActiveOccupationEffects,
  arenaOccupationEffectModifiers,
  combineArenaStatModifiers,
  type ArenaIncidentKey,
} from "@/lib/games/arena-occupations";

type RandomSource = () => number;

const looseAttributesSchema = z.object(
  Object.fromEntries(
    ARENA_ATTRIBUTE_KEYS.map((key) => [key, z.number().int().min(1).max(99)]),
  ) as Record<(typeof ARENA_ATTRIBUTE_KEYS)[number], z.ZodNumber>,
);

const derivedSchema = z.object({
  maxHealth: z.number().int().positive(),
  maxEnergy: z.number().int().positive(),
  baseDamage: z.number().int().positive(),
  accuracy: z.number().int().nonnegative(),
  evasion: z.number().int().nonnegative(),
  guard: z.number().int().nonnegative(),
  crowdBonus: z.number().int().nonnegative(),
  movement: z.number().int().positive(),
});

const snapshotSchema = z.object({
  name: z.string().min(1).max(80),
  level: z.number().int().min(1).max(60).optional().default(1),
  appearance: arenaAppearanceSchema,
  equipment: z.array(z.enum(ARENA_CATALOG_KEYS)).max(4).optional().default([]),
  famePenalty: z
    .object({
      maxEnergy: z.number().int().max(-1),
      accuracy: z.number().int().max(-1),
    })
    .nullable()
    .optional()
    .default(null),
  attributes: looseAttributesSchema,
  derived: derivedSchema,
  style: z.enum(["BALANCED", "AGGRESSIVE", "TACTICAL"]),
  intro: z.string().max(160),
});

const eventSchema = z.object({
  actor: z.enum(["PLAYER", "OPPONENT"]),
  kind: z.enum(["MOVE", "HIT", "MISS", "GUARD", "RECOVER", "KNOCKOUT"]),
  message: z.string().min(1).max(240),
  amount: z.number().int().nonnegative().optional(),
});

const battleSelect = {
  id: true,
  gladiatorId: true,
  opponentKey: true,
  status: true,
  round: true,
  playerHealth: true,
  playerEnergy: true,
  playerPosition: true,
  playerGuarded: true,
  opponentHealth: true,
  opponentEnergy: true,
  opponentPosition: true,
  opponentGuarded: true,
  goldReward: true,
  experienceReward: true,
  fameReward: true,
  skillPointsReward: true,
  shelterPointsReward: true,
  playerSnapshot: true,
  opponentSnapshot: true,
  createdAt: true,
  updatedAt: true,
  finishedAt: true,
  turns: {
    orderBy: [{ round: "desc" as const }],
    take: 20,
    select: {
      id: true,
      round: true,
      playerAction: true,
      opponentAction: true,
      actingFirst: true,
      events: true,
      playerHealth: true,
      playerEnergy: true,
      playerPosition: true,
      opponentHealth: true,
      opponentEnergy: true,
      opponentPosition: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ArenaBattleSelect;

type StoredBattle = Prisma.ArenaBattleGetPayload<{ select: typeof battleSelect }>;

async function transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const serializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2034" ||
          (error.code === "P2010" && String(error.meta?.code) === "40001"));
      if (!serializationConflict) throw error;
      if (attempt === 2)
        throw new AppError("O duelo mudou durante sua ação. Tente novamente.", 409);
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function gladiatorFor(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.arenaGladiator.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        id: true,
        name: true,
        entryLine: true,
        appearance: true,
        strength: true,
        agility: true,
        technique: true,
        defence: true,
        vitality: true,
        presence: true,
        stamina: true,
        level: true,
        experience: true,
        fame: true,
        campaignStep: true,
        campaignCompletions: true,
        inventory: {
          where: { equippedSlot: { not: null } },
          select: { catalogItemKey: true },
        },
        occupations: {
          where: { incident: { not: null } },
          orderBy: [{ finishedAt: "desc" as const }, { id: "desc" as const }],
          take: 10,
          select: { incident: true, effectExpiresAt: true },
        },
      },
    }),
    "Crie seu gladiador antes de entrar na arena.",
  );
}

function stateFrom(battle: StoredBattle): ArenaBattleState {
  return {
    round: battle.round,
    playerHealth: battle.playerHealth,
    playerEnergy: battle.playerEnergy,
    playerPosition: battle.playerPosition,
    playerGuarded: battle.playerGuarded,
    opponentHealth: battle.opponentHealth,
    opponentEnergy: battle.opponentEnergy,
    opponentPosition: battle.opponentPosition,
    opponentGuarded: battle.opponentGuarded,
  };
}

function serializeBattle(battle: StoredBattle) {
  const player = snapshotSchema.parse(battle.playerSnapshot);
  const opponent = snapshotSchema.parse(battle.opponentSnapshot);
  const catalog = arenaOpponent(battle.opponentKey);
  const state = stateFrom(battle);
  const unavailableReasons = Object.fromEntries(
    ARENA_BATTLE_ACTIONS.map((action) => [
      action,
      battle.status === "ACTIVE"
        ? arenaActionUnavailableReason(state, "PLAYER", action)
        : "O duelo já terminou.",
    ]),
  );
  return {
    id: battle.id,
    status: battle.status,
    round: battle.round,
    distance: arenaBattleDistance(state),
    player: {
      ...player,
      health: battle.playerHealth,
      energy: battle.playerEnergy,
      position: battle.playerPosition,
      guarded: battle.playerGuarded,
    },
    opponent: {
      ...opponent,
      key: battle.opponentKey,
      title: catalog?.title ?? "Adversário da arena",
      difficulty: catalog?.difficulty ?? "DESAFIADOR",
      health: battle.opponentHealth,
      energy: battle.opponentEnergy,
      position: battle.opponentPosition,
      guarded: battle.opponentGuarded,
    },
    unavailableReasons,
    turns: battle.turns.map((turn) => ({
      ...turn,
      events: z.array(eventSchema).parse(turn.events),
      createdAt: turn.createdAt.toISOString(),
    })),
    createdAt: battle.createdAt.toISOString(),
    updatedAt: battle.updatedAt.toISOString(),
    finishedAt: battle.finishedAt?.toISOString() ?? null,
    rewards: {
      gold: battle.goldReward,
      experience: battle.experienceReward,
      fame: battle.fameReward,
      skillPoints: battle.skillPointsReward,
      shelterPoints: battle.shelterPointsReward,
    },
  };
}

function playerSnapshot(gladiator: Awaited<ReturnType<typeof gladiatorFor>>) {
  const attributes = {
    strength: gladiator.strength,
    agility: gladiator.agility,
    technique: gladiator.technique,
    defence: gladiator.defence,
    vitality: gladiator.vitality,
    presence: gladiator.presence,
    stamina: gladiator.stamina,
  };
  const equipment = gladiator.inventory.map((item) => item.catalogItemKey);
  const equipmentModifiers = arenaEquipmentModifiers(equipment);
  const effects = arenaActiveOccupationEffects(
    gladiator.occupations.map((occupation) => ({
      incident: occupation.incident as ArenaIncidentKey | null,
      effectExpiresAt: occupation.effectExpiresAt,
    })),
  );
  const temporaryModifiers = arenaOccupationEffectModifiers(effects);
  const famePenalty = arenaLowFamePenalty(gladiator.fame);
  return {
    name: gladiator.name,
    level: gladiator.level,
    appearance: arenaAppearanceSchema.parse(gladiator.appearance),
    equipment,
    famePenalty,
    attributes,
    derived: arenaDerivedStats(
      attributes,
      combineArenaStatModifiers(equipmentModifiers, temporaryModifiers, famePenalty ?? {}),
    ),
    style: "BALANCED" as const,
    intro: gladiator.entryLine ?? "A areia conhecerá meu nome.",
  } satisfies ArenaCombatantSnapshot;
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getActiveArenaBattle(userId: string, communityId: string) {
  return transaction(async (db) => {
    const gladiator = await gladiatorFor(db, userId, communityId);
    const battle = await db.arenaBattle.findFirst({
      where: { gladiatorId: gladiator.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: battleSelect,
    });
    return battle ? serializeBattle(battle) : null;
  });
}

export async function startArenaBattle(
  userId: string,
  communityId: string,
  rawInput: StartArenaBattleInput,
) {
  const input = startArenaBattleSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Adversário inválido.");
  try {
    return await transaction(async (db) => {
      const gladiator = await gladiatorFor(db, userId, communityId);
      await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${gladiator.id}::uuid FOR UPDATE`;
      await assertArenaGladiatorAvailable(db, gladiator.id);
      const active = await db.arenaBattle.findFirst({
        where: { gladiatorId: gladiator.id, status: "ACTIVE" },
        select: battleSelect,
      });
      if (active) return serializeBattle(active);
      const currentOpponents = arenaCampaignOpponents(gladiator.campaignCompletions);
      const chosenOpponent = arenaAccessibleCampaignOpponents(gladiator.campaignCompletions).find(
        (opponent) => opponent.key === input.data.opponentKey,
      );
      if (!chosenOpponent)
        throw new AppError("Este adversário não pertence à liga atual ou à anterior.", 409);
      const chosenStep = arenaOpponentCampaignStep(
        chosenOpponent.key,
        gladiator.campaignCompletions,
      );
      const belongsToCurrentLeague = currentOpponents.some(
        (opponent) => opponent.key === chosenOpponent.key,
      );
      if (belongsToCurrentLeague && (chosenStep === null || chosenStep > gladiator.campaignStep))
        throw new AppError(
          `Vença ${arenaCampaignOpponent(gladiator.campaignStep, gladiator.campaignCompletions).name} antes de abrir este portão.`,
          409,
          "CAMPAIGN_LOCKED",
        );
      const player = playerSnapshot(gladiator);
      const opponentSnapshot: ArenaCombatantSnapshot = chosenOpponent;
      const battle = await db.arenaBattle.create({
        data: {
          gladiatorId: gladiator.id,
          opponentKey: chosenOpponent.key,
          playerHealth: player.derived.maxHealth,
          playerEnergy: player.derived.maxEnergy,
          opponentHealth: opponentSnapshot.derived.maxHealth,
          opponentEnergy: opponentSnapshot.derived.maxEnergy,
          playerSnapshot: json(player),
          opponentSnapshot: json(opponentSnapshot),
        },
        select: battleSelect,
      });
      return serializeBattle(battle);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Você já possui um duelo em andamento.", 409, "CONFLICT");
    throw error;
  }
}

export async function playArenaBattleAction(
  userId: string,
  communityId: string,
  battleId: string,
  rawInput: ArenaBattleActionInput,
  random: RandomSource = Math.random,
) {
  const input = arenaBattleActionSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Ação inválida.");

  return transaction(async (db) => {
    const gladiator = await gladiatorFor(db, userId, communityId);
    await assertArenaGladiatorAvailable(db, gladiator.id);
    const owned = assertFound(
      await db.arenaBattle.findFirst({
        where: { id: battleId, gladiatorId: gladiator.id },
        select: { id: true },
      }),
      "Duelo não encontrado.",
    );
    await db.$queryRaw`SELECT "id" FROM "ArenaBattle" WHERE "id" = ${owned.id}::uuid FOR UPDATE`;
    const battle = assertFound(
      await db.arenaBattle.findFirst({
        where: { id: battleId, gladiatorId: gladiator.id },
        select: battleSelect,
      }),
      "Duelo não encontrado.",
    );
    if (battle.status !== "ACTIVE") throw new AppError("Este duelo já terminou.", 409);
    if (input.data.round !== battle.round)
      throw new AppError("Esta rodada já foi resolvida. Atualize o duelo.", 409, "STALE_ROUND");
    const player = snapshotSchema.parse(battle.playerSnapshot);
    const opponentSnapshot = snapshotSchema.parse(battle.opponentSnapshot);
    let result;
    try {
      result = resolveArenaRound(
        stateFrom(battle),
        player,
        opponentSnapshot,
        input.data.action,
        random,
      );
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "Ação inválida.");
    }
    const finished = result.outcome !== "ACTIVE";
    const opponentCatalog = arenaOpponent(battle.opponentKey);
    const opponentLeague = arenaOpponentLeague(battle.opponentKey) ?? 1;
    const calculatedReward = finished
      ? arenaBattleReward(
          opponentCatalog?.difficulty ?? "INICIANTE",
          result.outcome,
          opponentSnapshot.level,
          opponentCatalog?.procedural ?? battle.opponentKey.startsWith("CHALLENGER_"),
          opponentLeague,
        )
      : { gold: 0, experience: 0, fame: 0, shelterPoints: 0 };
    const reward = {
      ...calculatedReward,
      fame: arenaFameChange(gladiator.fame, calculatedReward.fame),
    };
    const progression = arenaProgressAfterExperience(
      gladiator.level,
      gladiator.experience + reward.experience,
    );
    const updated = await db.arenaBattle.update({
      where: { id: battle.id },
      data: {
        status: result.outcome,
        round: finished ? battle.round : battle.round + 1,
        playerHealth: result.state.playerHealth,
        playerEnergy: result.state.playerEnergy,
        playerPosition: result.state.playerPosition,
        playerGuarded: result.state.playerGuarded,
        opponentHealth: result.state.opponentHealth,
        opponentEnergy: result.state.opponentEnergy,
        opponentPosition: result.state.opponentPosition,
        opponentGuarded: result.state.opponentGuarded,
        goldReward: reward.gold,
        experienceReward: reward.experience,
        fameReward: reward.fame,
        skillPointsReward: progression.skillPointsGained,
        shelterPointsReward: reward.shelterPoints,
        finishedAt: finished ? new Date() : null,
        turns: {
          create: {
            round: battle.round,
            playerAction: input.data.action,
            opponentAction: result.opponentAction,
            actingFirst: result.actingFirst,
            events: json(result.events satisfies ArenaBattleEvent[]),
            playerHealth: result.state.playerHealth,
            playerEnergy: result.state.playerEnergy,
            playerPosition: result.state.playerPosition,
            opponentHealth: result.state.opponentHealth,
            opponentEnergy: result.state.opponentEnergy,
            opponentPosition: result.state.opponentPosition,
          },
        },
      },
      select: battleSelect,
    });
    const campaignBattleStep = arenaOpponentCampaignStep(
      battle.opponentKey,
      gladiator.campaignCompletions,
    );
    if (finished)
      await db.arenaGladiator.update({
        where: { id: gladiator.id },
        data: {
          wins: result.outcome === "WON" ? { increment: 1 } : undefined,
          losses: result.outcome === "LOST" ? { increment: 1 } : undefined,
          gold: { increment: reward.gold },
          experience: { increment: reward.experience },
          fame: { increment: reward.fame },
          level: progression.level,
          unspentSkillPoints: { increment: progression.skillPointsGained },
          campaignStep:
            result.outcome === "WON" && campaignBattleStep === gladiator.campaignStep
              ? gladiator.campaignStep === ARENA_CAMPAIGN_LENGTH - 1
                ? 0
                : gladiator.campaignStep + 1
              : undefined,
          campaignCompletions:
            result.outcome === "WON" &&
            gladiator.campaignStep === ARENA_CAMPAIGN_LENGTH - 1 &&
            campaignBattleStep === gladiator.campaignStep
              ? { increment: 1 }
              : undefined,
          shelter: {
            update: { points: { increment: reward.shelterPoints } },
          },
        },
      });
    return serializeBattle(updated);
  });
}

export async function abandonArenaBattle(userId: string, communityId: string, battleId: string) {
  return transaction(async (db) => {
    const gladiator = await gladiatorFor(db, userId, communityId);
    await assertArenaGladiatorAvailable(db, gladiator.id);
    const owned = assertFound(
      await db.arenaBattle.findFirst({
        where: { id: battleId, gladiatorId: gladiator.id },
        select: { id: true },
      }),
      "Duelo não encontrado.",
    );
    await db.$queryRaw`SELECT "id" FROM "ArenaBattle" WHERE "id" = ${owned.id}::uuid FOR UPDATE`;
    const battle = assertFound(
      await db.arenaBattle.findFirst({
        where: { id: battleId, gladiatorId: gladiator.id },
        select: battleSelect,
      }),
      "Duelo não encontrado.",
    );
    if (battle.status !== "ACTIVE") return serializeBattle(battle);
    const opponentLeague = arenaOpponentLeague(battle.opponentKey) ?? 1;
    const fameChange = arenaFameChange(gladiator.fame, opponentLeague >= 6 ? -1 : 0);
    const updated = await db.arenaBattle.update({
      where: { id: battle.id },
      data: { status: "ABANDONED", fameReward: fameChange, finishedAt: new Date() },
      select: battleSelect,
    });
    await db.arenaGladiator.update({
      where: { id: gladiator.id },
      data: { losses: { increment: 1 }, fame: { increment: fameChange } },
    });
    return serializeBattle(updated);
  });
}

export type ArenaBattleView = NonNullable<Awaited<ReturnType<typeof getActiveArenaBattle>>>;
