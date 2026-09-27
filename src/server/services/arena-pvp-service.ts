import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { arenaDerivedStats, ARENA_ATTRIBUTE_KEYS } from "@/lib/games/arena";
import {
  arenaEquipmentModifiers,
  arenaLowFamePenalty,
  arenaProgressAfterExperience,
} from "@/lib/games/arena-economy";
import {
  ARENA_PVP_INJURY_MINUTES,
  arenaPvpCombatPower,
  arenaPvpRaidDuration,
  arenaPvpShelterDefenceBonus,
  resolveArenaPvpRaid,
  type ArenaPvpCombatSnapshot,
} from "@/lib/games/arena-pvp";
import { arenaShelterStage, arenaShelterStats } from "@/lib/games/arena-shelter";
import {
  arenaActiveOccupationEffects,
  arenaOccupationEffectModifiers,
  combineArenaStatModifiers,
  type ArenaIncidentKey,
} from "@/lib/games/arena-occupations";
import { arenaAppearanceSchema, startArenaPvpRaidSchema } from "@/lib/validation/arena";
import type { StartArenaPvpRaidInput } from "@/lib/validation/arena";
import { AppError, assertFound } from "@/server/errors";

type RandomSource = () => number;

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

const shelterStatsSchema = z.object({
  defence: z.number().int().nonnegative(),
  comfort: z.number().int().nonnegative(),
  supplies: z.number().int().nonnegative(),
  training: z.number().int().nonnegative(),
  prestige: z.number().int().nonnegative(),
});

const snapshotSchema = z.object({
  name: z.string().min(1).max(40),
  level: z.number().int().positive(),
  appearance: arenaAppearanceSchema,
  equipment: z.array(z.string().max(80)).max(4),
  derived: derivedSchema,
  combatPower: z.number().int().positive(),
  shelter: z
    .object({
      level: z.number().int().min(1).max(10),
      name: z.string().min(1),
      stats: shelterStatsSchema,
      defenceBonus: z.number().int().nonnegative(),
    })
    .nullable(),
});

const fighterSelect = {
  id: true,
  communityId: true,
  userId: true,
  name: true,
  appearance: true,
  level: true,
  experience: true,
  fame: true,
  gold: true,
  injuredUntil: true,
  strength: true,
  agility: true,
  technique: true,
  defence: true,
  vitality: true,
  presence: true,
  stamina: true,
  wins: true,
  losses: true,
  inventory: {
    where: { equippedSlot: { not: null } },
    select: { catalogItemKey: true },
  },
  shelter: {
    select: {
      level: true,
      items: { select: { catalogItemKey: true } },
    },
  },
  occupations: {
    where: { incident: { not: null } },
    orderBy: [{ finishedAt: "desc" as const }, { id: "desc" as const }],
    take: 10,
    select: { incident: true, effectExpiresAt: true },
  },
} satisfies Prisma.ArenaGladiatorSelect;

const targetSelect = {
  id: true,
  name: true,
  appearance: true,
  shelter: { select: { level: true } },
} satisfies Prisma.ArenaGladiatorSelect;

type Fighter = Prisma.ArenaGladiatorGetPayload<{ select: typeof fighterSelect }>;

const raidSelect = {
  id: true,
  communityId: true,
  attackerId: true,
  defenderId: true,
  status: true,
  durationMinutes: true,
  goldStolen: true,
  experienceReward: true,
  attackerScore: true,
  defenderScore: true,
  attackerSnapshot: true,
  defenderSnapshot: true,
  startedAt: true,
  endsAt: true,
  resolvedAt: true,
  injuryEndsAt: true,
} satisfies Prisma.ArenaPvpRaidSelect;

type StoredRaid = Prisma.ArenaPvpRaidGetPayload<{ select: typeof raidSelect }>;

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
        throw new AppError("O saque mudou durante a operação. Tente novamente.", 409);
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { userId: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function combatSnapshot(fighter: Fighter): ArenaPvpCombatSnapshot {
  const attributes = Object.fromEntries(
    ARENA_ATTRIBUTE_KEYS.map((key) => [key, fighter[key]]),
  ) as Record<(typeof ARENA_ATTRIBUTE_KEYS)[number], number>;
  const equipment = fighter.inventory.map((item) => item.catalogItemKey);
  const effects = arenaActiveOccupationEffects(
    fighter.occupations.map((occupation) => ({
      incident: occupation.incident as ArenaIncidentKey | null,
      effectExpiresAt: occupation.effectExpiresAt,
    })),
  );
  const derived = arenaDerivedStats(
    attributes,
    combineArenaStatModifiers(
      arenaEquipmentModifiers(equipment),
      arenaOccupationEffectModifiers(effects),
      arenaLowFamePenalty(fighter.fame) ?? {},
    ),
  );
  const shelterStatsValue = fighter.shelter
    ? arenaShelterStats(
        fighter.shelter.level,
        fighter.shelter.items.map((item) => item.catalogItemKey),
      )
    : null;
  return {
    name: fighter.name,
    level: fighter.level,
    appearance: arenaAppearanceSchema.parse(fighter.appearance),
    equipment,
    derived,
    combatPower: arenaPvpCombatPower(fighter.level, derived),
    shelter:
      fighter.shelter && shelterStatsValue
        ? {
            level: fighter.shelter.level,
            name: arenaShelterStage(fighter.shelter.level).name,
            stats: shelterStatsValue,
            defenceBonus: arenaPvpShelterDefenceBonus(shelterStatsValue),
          }
        : null,
  };
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeRaid(raid: StoredRaid, perspective: "ATTACKER" | "DEFENDER") {
  const attacker = snapshotSchema.parse(raid.attackerSnapshot);
  const defender = snapshotSchema.parse(raid.defenderSnapshot);
  return {
    id: raid.id,
    status: raid.status,
    perspective,
    durationMinutes: raid.durationMinutes,
    goldStolen: raid.goldStolen,
    experienceReward: raid.experienceReward,
    attacker: { name: attacker.name },
    defender: { name: defender.name },
    startedAt: raid.startedAt.toISOString(),
    endsAt: raid.endsAt.toISOString(),
    resolvedAt: raid.resolvedAt?.toISOString() ?? null,
    injuryEndsAt: raid.injuryEndsAt?.toISOString() ?? null,
  };
}

async function settleRaid(
  db: Prisma.TransactionClient,
  raidId: string,
  now: Date,
  random: RandomSource,
) {
  await db.$queryRaw`SELECT "id" FROM "ArenaPvpRaid" WHERE "id" = ${raidId}::uuid FOR UPDATE`;
  const raid = await db.arenaPvpRaid.findUnique({ where: { id: raidId }, select: raidSelect });
  if (!raid || raid.status !== "ACTIVE" || raid.endsAt > now) return;

  const ids = [raid.attackerId, raid.defenderId].sort();
  await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${ids[0]}::uuid FOR UPDATE`;
  await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${ids[1]}::uuid FOR UPDATE`;
  const [attacker, defender] = await Promise.all([
    db.arenaGladiator.findUnique({
      where: { id: raid.attackerId },
      select: { id: true, level: true, experience: true },
    }),
    db.arenaGladiator.findUnique({
      where: { id: raid.defenderId },
      select: { id: true, gold: true },
    }),
  ]);
  if (!attacker || !defender) return;

  const attackerSnapshot = snapshotSchema.parse(raid.attackerSnapshot);
  const defenderSnapshot = snapshotSchema.parse(raid.defenderSnapshot);
  const outcome = resolveArenaPvpRaid(attackerSnapshot, defenderSnapshot, defender.gold, random);
  const progression = arenaProgressAfterExperience(
    attacker.level,
    attacker.experience + outcome.experienceReward,
  );
  const injuryEndsAt = outcome.injured
    ? new Date(raid.endsAt.getTime() + ARENA_PVP_INJURY_MINUTES * 60_000)
    : null;

  await db.arenaPvpRaid.update({
    where: { id: raid.id },
    data: {
      status: outcome.status,
      goldStolen: outcome.goldStolen,
      experienceReward: outcome.experienceReward,
      attackerScore: outcome.attackerScore,
      defenderScore: outcome.defenderScore,
      resolvedAt: raid.endsAt,
      injuryEndsAt,
    },
  });
  await db.arenaGladiator.update({
    where: { id: attacker.id },
    data: {
      gold: { increment: outcome.goldStolen },
      experience: { increment: outcome.experienceReward },
      level: progression.level,
      unspentSkillPoints: { increment: progression.skillPointsGained },
      injuredUntil: injuryEndsAt,
    },
  });
  if (outcome.goldStolen > 0)
    await db.arenaGladiator.update({
      where: { id: defender.id },
      data: { gold: { decrement: outcome.goldStolen } },
    });
}

async function settleExpiredRaids(
  db: Prisma.TransactionClient,
  gladiatorId: string,
  now: Date,
  random: RandomSource,
) {
  const expired = await db.arenaPvpRaid.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { lte: now },
      OR: [{ attackerId: gladiatorId }, { defenderId: gladiatorId }],
    },
    orderBy: [{ endsAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  for (const raid of expired) await settleRaid(db, raid.id, now, random);
}

async function buildHub(db: Prisma.TransactionClient, gladiator: Fighter, now: Date) {
  const [active, outgoing, incoming, targets] = await Promise.all([
    db.arenaPvpRaid.findFirst({
      where: { attackerId: gladiator.id, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: raidSelect,
    }),
    db.arenaPvpRaid.findMany({
      where: { attackerId: gladiator.id, status: { not: "ACTIVE" } },
      orderBy: [{ resolvedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: raidSelect,
    }),
    db.arenaPvpRaid.findMany({
      where: { defenderId: gladiator.id },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: raidSelect,
    }),
    db.arenaGladiator.findMany({
      where: { communityId: gladiator.communityId, id: { not: gladiator.id } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: targetSelect,
    }),
  ]);
  return {
    active: active ? serializeRaid(active, "ATTACKER") : null,
    outgoing: outgoing.map((raid) => serializeRaid(raid, "ATTACKER")),
    incoming: incoming.map((raid) => serializeRaid(raid, "DEFENDER")),
    targets: targets.map((target) => ({
      id: target.id,
      name: target.name,
      appearance: arenaAppearanceSchema.parse(target.appearance),
      shelterLevel: target.shelter?.level ?? 1,
      durationMinutes: arenaPvpRaidDuration(
        gladiator.shelter?.level ?? 1,
        target.shelter?.level ?? 1,
      ),
    })),
    condition: {
      injured: Boolean(gladiator.injuredUntil && gladiator.injuredUntil > now),
      injuredUntil: gladiator.injuredUntil?.toISOString() ?? null,
      famePenalty: arenaLowFamePenalty(gladiator.fame),
    },
    serverTime: now.toISOString(),
  };
}

export async function getArenaPvpHub(
  userId: string,
  communityId: string,
  now = new Date(),
  random: RandomSource = Math.random,
) {
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    const owned = await db.arenaGladiator.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    });
    if (!owned)
      return {
        active: null,
        outgoing: [],
        incoming: [],
        targets: [],
        condition: { injured: false, injuredUntil: null, famePenalty: null },
        serverTime: now.toISOString(),
      };
    await settleExpiredRaids(db, owned.id, now, random);
    const gladiator = assertFound(
      await db.arenaGladiator.findUnique({ where: { id: owned.id }, select: fighterSelect }),
      "Gladiador não encontrado.",
    );
    return buildHub(db, gladiator, now);
  });
}

export async function startArenaPvpRaid(
  userId: string,
  communityId: string,
  rawInput: StartArenaPvpRaidInput,
  now = new Date(),
  random: RandomSource = Math.random,
) {
  const input = startArenaPvpRaidSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Alvo inválido.");
  try {
    return await transaction(async (db) => {
      await membership(db, userId, communityId);
      const attackerId = assertFound(
        await db.arenaGladiator.findUnique({
          where: { communityId_userId: { communityId, userId } },
          select: { id: true },
        }),
        "Crie seu gladiador antes de iniciar um saque.",
      ).id;
      if (attackerId === input.data.defenderId)
        throw new AppError("Você não pode saquear o próprio Refúgio.", 409);
      const lockIds = [attackerId, input.data.defenderId].sort();
      await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${lockIds[0]}::uuid FOR UPDATE`;
      await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${lockIds[1]}::uuid FOR UPDATE`;
      await settleExpiredRaids(db, attackerId, now, random);
      const [attacker, defender] = await Promise.all([
        db.arenaGladiator.findUnique({ where: { id: attackerId }, select: fighterSelect }),
        db.arenaGladiator.findFirst({
          where: { id: input.data.defenderId, communityId },
          select: fighterSelect,
        }),
      ]);
      const ownedAttacker = assertFound(attacker, "Gladiador não encontrado.");
      const target = assertFound(defender, "O gladiador escolhido não pertence a esta comunidade.");
      const [occupation, battle, activeRaid] = await Promise.all([
        db.arenaOccupation.findFirst({
          where: { gladiatorId: attackerId, status: "ACTIVE" },
          select: { id: true },
        }),
        db.arenaBattle.findFirst({
          where: { gladiatorId: attackerId, status: "ACTIVE" },
          select: { id: true },
        }),
        db.arenaPvpRaid.findFirst({
          where: { attackerId, status: "ACTIVE" },
          select: { id: true },
        }),
      ]);
      if (ownedAttacker.injuredUntil && ownedAttacker.injuredUntil > now)
        throw new AppError("Seu gladiador ainda está se recuperando dos ferimentos.", 409);
      if (occupation) throw new AppError("Seu gladiador já está em outra atividade.", 409);
      if (battle) throw new AppError("Encerre o duelo atual antes de iniciar um saque.", 409);
      if (activeRaid) throw new AppError("Seu gladiador já está realizando um saque.", 409);

      const attackerSnapshot = combatSnapshot(ownedAttacker);
      const defenderSnapshot = combatSnapshot(target);
      const durationMinutes = arenaPvpRaidDuration(
        attackerSnapshot.shelter?.level ?? 1,
        defenderSnapshot.shelter?.level ?? 1,
      );
      await db.arenaPvpRaid.create({
        data: {
          communityId,
          attackerId,
          defenderId: target.id,
          durationMinutes,
          endsAt: new Date(now.getTime() + durationMinutes * 60_000),
          attackerSnapshot: json(attackerSnapshot),
          defenderSnapshot: json(defenderSnapshot),
        },
      });
      const refreshed = assertFound(
        await db.arenaGladiator.findUnique({ where: { id: attackerId }, select: fighterSelect }),
        "Gladiador não encontrado.",
      );
      return buildHub(db, refreshed, now);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Seu gladiador já está realizando um saque.", 409, "CONFLICT");
    throw error;
  }
}

export type ArenaPvpHub = Awaited<ReturnType<typeof getArenaPvpHub>>;
