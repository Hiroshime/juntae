import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ARENA_OCCUPATION_TASKS,
  arenaActiveOccupationEffects,
  arenaOccupationTask,
  resolveArenaOccupation,
  type ArenaIncidentKey,
} from "@/lib/games/arena-occupations";
import { arenaProgressAfterExperience } from "@/lib/games/arena-economy";
import { startArenaOccupationSchema, type StartArenaOccupationInput } from "@/lib/validation/arena";
import { AppError, assertFound } from "@/server/errors";
import { assertArenaGladiatorAvailable } from "@/server/services/arena-availability";

type RandomSource = () => number;

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
        throw new AppError("A atividade mudou durante a operação. Tente novamente.", 409);
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function ownedGladiator(db: Prisma.TransactionClient, userId: string, communityId: string) {
  const membership = await db.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { userId: true },
  });
  if (!membership) throw new AppError("Você não participa desta comunidade.", 404, "NOT_FOUND");
  return db.arenaGladiator.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { id: true, level: true, experience: true },
  });
}

const occupationSelect = {
  id: true,
  taskKey: true,
  kind: true,
  status: true,
  durationHours: true,
  goldReward: true,
  experienceReward: true,
  shelterPointsReward: true,
  incident: true,
  resultMessage: true,
  startedAt: true,
  endsAt: true,
  finishedAt: true,
  effectExpiresAt: true,
} satisfies Prisma.ArenaOccupationSelect;

type StoredOccupation = Prisma.ArenaOccupationGetPayload<{ select: typeof occupationSelect }>;

function serializeOccupation(occupation: StoredOccupation) {
  const task = arenaOccupationTask(occupation.taskKey);
  return {
    ...occupation,
    task: task
      ? {
          key: task.key,
          kind: task.kind,
          name: task.name,
          description: task.description,
          riskPercent: task.riskPercent,
        }
      : null,
    startedAt: occupation.startedAt.toISOString(),
    endsAt: occupation.endsAt.toISOString(),
    finishedAt: occupation.finishedAt?.toISOString() ?? null,
    effectExpiresAt: occupation.effectExpiresAt?.toISOString() ?? null,
  };
}

async function settleExpiredOccupation(
  db: Prisma.TransactionClient,
  gladiator: { id: string; level: number; experience: number },
  now: Date,
  random: RandomSource,
) {
  const pending = await db.arenaOccupation.findFirst({
    where: { gladiatorId: gladiator.id, status: "ACTIVE", endsAt: { lte: now } },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });
  if (!pending) return;

  await db.$queryRaw`SELECT "id" FROM "ArenaOccupation" WHERE "id" = ${pending.id}::uuid FOR UPDATE`;
  const occupation = await db.arenaOccupation.findUnique({
    where: { id: pending.id },
    select: occupationSelect,
  });
  if (!occupation || occupation.status !== "ACTIVE" || occupation.endsAt > now) return;
  const task = assertFound(arenaOccupationTask(occupation.taskKey), "Atividade da Arena inválida.");
  const outcome = resolveArenaOccupation(task, random);
  const progression = arenaProgressAfterExperience(
    gladiator.level,
    gladiator.experience + outcome.rewards.experience,
  );
  const effectExpiresAt = outcome.incident
    ? new Date(occupation.endsAt.getTime() + outcome.effectDurationHours * 60 * 60_000)
    : null;

  await db.arenaOccupation.update({
    where: { id: occupation.id },
    data: {
      status: "COMPLETED",
      goldReward: outcome.rewards.gold,
      experienceReward: outcome.rewards.experience,
      shelterPointsReward: outcome.rewards.shelterPoints,
      incident: outcome.incident,
      resultMessage: outcome.message,
      finishedAt: occupation.endsAt,
      effectExpiresAt,
    },
  });
  await db.arenaGladiator.update({
    where: { id: gladiator.id },
    data: {
      gold: { increment: outcome.rewards.gold },
      experience: { increment: outcome.rewards.experience },
      level: progression.level,
      unspentSkillPoints: { increment: progression.skillPointsGained },
      shelter: { update: { points: { increment: outcome.rewards.shelterPoints } } },
    },
  });
}

async function hub(db: Prisma.TransactionClient, gladiatorId: string, now: Date) {
  const [active, history, effectRecords] = await Promise.all([
    db.arenaOccupation.findFirst({
      where: { gladiatorId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: occupationSelect,
    }),
    db.arenaOccupation.findMany({
      where: { gladiatorId, status: "COMPLETED" },
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      take: 8,
      select: occupationSelect,
    }),
    db.arenaOccupation.findMany({
      where: { gladiatorId, incident: { not: null }, effectExpiresAt: { gt: now } },
      orderBy: { effectExpiresAt: "desc" },
      select: { incident: true, effectExpiresAt: true },
    }),
  ]);
  const effects = arenaActiveOccupationEffects(
    effectRecords.map((record) => ({
      incident: record.incident as ArenaIncidentKey | null,
      effectExpiresAt: record.effectExpiresAt,
    })),
    now,
  );
  return {
    active: active ? serializeOccupation(active) : null,
    history: history.map(serializeOccupation),
    effects: effects.map((effect) => ({
      ...effect,
      expiresAt: effect.expiresAt.toISOString(),
    })),
    tasks: ARENA_OCCUPATION_TASKS.map((task) => ({ ...task })),
    serverTime: now.toISOString(),
  };
}

export async function getArenaOccupationHub(
  userId: string,
  communityId: string,
  now = new Date(),
  random: RandomSource = Math.random,
) {
  return transaction(async (db) => {
    const gladiator = await ownedGladiator(db, userId, communityId);
    if (!gladiator)
      return { active: null, history: [], effects: [], tasks: [], serverTime: now.toISOString() };
    await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${gladiator.id}::uuid FOR UPDATE`;
    await settleExpiredOccupation(db, gladiator, now, random);
    return hub(db, gladiator.id, now);
  });
}

export async function startArenaOccupation(
  userId: string,
  communityId: string,
  rawInput: StartArenaOccupationInput,
  now = new Date(),
  random: RandomSource = Math.random,
) {
  const input = startArenaOccupationSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Atividade inválida.");
  const task = assertFound(arenaOccupationTask(input.data.taskKey), "Atividade inválida.");

  try {
    return await transaction(async (db) => {
      const gladiator = assertFound(
        await ownedGladiator(db, userId, communityId),
        "Crie seu gladiador antes de iniciar uma atividade.",
      );
      await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${gladiator.id}::uuid FOR UPDATE`;
      await settleExpiredOccupation(db, gladiator, now, random);
      await assertArenaGladiatorAvailable(db, gladiator.id);
      const currentGladiator = assertFound(
        await db.arenaGladiator.findUnique({
          where: { id: gladiator.id },
          select: { level: true },
        }),
        "Gladiador não encontrado.",
      );
      const [active, battle] = await Promise.all([
        db.arenaOccupation.findFirst({
          where: { gladiatorId: gladiator.id, status: "ACTIVE" },
          select: { id: true },
        }),
        db.arenaBattle.findFirst({
          where: { gladiatorId: gladiator.id, status: "ACTIVE" },
          select: { id: true },
        }),
      ]);
      if (active) throw new AppError("Seu gladiador já está em outra atividade.", 409);
      if (battle) throw new AppError("Encerre o duelo atual antes de iniciar uma atividade.", 409);
      if (currentGladiator.level < task.requiredLevel)
        throw new AppError(`Esta atividade exige o nível ${task.requiredLevel}.`, 409);

      await db.arenaOccupation.create({
        data: {
          gladiatorId: gladiator.id,
          taskKey: task.key,
          kind: task.kind,
          durationHours: task.durationHours,
          endsAt: new Date(now.getTime() + task.durationHours * 60 * 60_000),
        },
      });
      return hub(db, gladiator.id, now);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Seu gladiador já está em outra atividade.", 409, "CONFLICT");
    throw error;
  }
}

export type ArenaOccupationHub = Awaited<ReturnType<typeof getArenaOccupationHub>>;
