import { Prisma } from "@prisma/client";
import { arenaDerivedStats } from "@/lib/games/arena";
import { prisma } from "@/lib/db/prisma";
import {
  arenaAppearanceSchema,
  createArenaGladiatorSchema,
  updateArenaGladiatorSchema,
  type CreateArenaGladiatorInput,
  type UpdateArenaGladiatorInput,
} from "@/lib/validation/arena";
import { AppError, assertFound } from "@/server/errors";

async function transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
        throw error;
      if (attempt === 2)
        throw new AppError("Seu gladiador mudou durante a operação. Tente novamente.", 409);
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

const gladiatorSelect = {
  id: true,
  communityId: true,
  userId: true,
  name: true,
  pronouns: true,
  origin: true,
  entryLine: true,
  victoryLine: true,
  appearance: true,
  level: true,
  experience: true,
  gold: true,
  fame: true,
  unspentSkillPoints: true,
  strength: true,
  agility: true,
  technique: true,
  defence: true,
  vitality: true,
  presence: true,
  stamina: true,
  wins: true,
  losses: true,
  createdAt: true,
  updatedAt: true,
  inventory: {
    orderBy: [{ acquiredAt: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      catalogItemKey: true,
      quantity: true,
      equippedSlot: true,
      metadata: true,
      acquiredAt: true,
    },
  },
} satisfies Prisma.ArenaGladiatorSelect;

type StoredGladiator = Prisma.ArenaGladiatorGetPayload<{ select: typeof gladiatorSelect }>;

function serializeGladiator(gladiator: StoredGladiator) {
  const attributes = {
    strength: gladiator.strength,
    agility: gladiator.agility,
    technique: gladiator.technique,
    defence: gladiator.defence,
    vitality: gladiator.vitality,
    presence: gladiator.presence,
    stamina: gladiator.stamina,
  };
  return {
    ...gladiator,
    appearance: arenaAppearanceSchema.parse(gladiator.appearance),
    attributes,
    derived: arenaDerivedStats(attributes),
    createdAt: gladiator.createdAt.toISOString(),
    updatedAt: gladiator.updatedAt.toISOString(),
    inventory: gladiator.inventory.map((item) => ({
      ...item,
      acquiredAt: item.acquiredAt.toISOString(),
    })),
  };
}

export async function getArenaGladiator(userId: string, communityId: string) {
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    const gladiator = await db.arenaGladiator.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: gladiatorSelect,
    });
    return gladiator ? serializeGladiator(gladiator) : null;
  });
}

export async function createArenaGladiator(
  userId: string,
  communityId: string,
  rawInput: CreateArenaGladiatorInput,
) {
  const input = createArenaGladiatorSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0].message);
  try {
    return await transaction(async (db) => {
      await membership(db, userId, communityId);
      const gladiator = await db.arenaGladiator.create({
        data: {
          communityId,
          userId,
          name: input.data.name,
          pronouns: input.data.pronouns,
          origin: input.data.origin,
          entryLine: input.data.entryLine || null,
          victoryLine: input.data.victoryLine || null,
          appearance: input.data.appearance,
          ...input.data.attributes,
        },
        select: gladiatorSelect,
      });
      return serializeGladiator(gladiator);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Você já possui um gladiador nesta comunidade.", 409, "CONFLICT");
    throw error;
  }
}

export async function updateArenaGladiator(
  userId: string,
  communityId: string,
  rawInput: UpdateArenaGladiatorInput,
) {
  const input = updateArenaGladiatorSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0].message);
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    assertFound(
      await db.arenaGladiator.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: { id: true },
      }),
      "Crie seu gladiador antes de editar a aparência.",
    );
    const gladiator = await db.arenaGladiator.update({
      where: { communityId_userId: { communityId, userId } },
      data: {
        name: input.data.name,
        pronouns: input.data.pronouns,
        origin: input.data.origin,
        entryLine: input.data.entryLine || null,
        victoryLine: input.data.victoryLine || null,
        appearance: input.data.appearance,
      },
      select: gladiatorSelect,
    });
    return serializeGladiator(gladiator);
  });
}

export type ArenaGladiatorProfile = NonNullable<Awaited<ReturnType<typeof getArenaGladiator>>>;
