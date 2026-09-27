import { Prisma } from "@prisma/client";
import { arenaDerivedStats, type ArenaAttributeKey } from "@/lib/games/arena";
import { arenaCampaignProgress, arenaOpponent } from "@/lib/games/arena-battle";
import { arenaLegacy } from "@/lib/games/arena-legacy";
import {
  arenaShelterItem,
  arenaShelterProgress,
  arenaShelterStats,
} from "@/lib/games/arena-shelter";
import {
  arenaActiveOccupationEffects,
  arenaOccupationEffectModifiers,
  combineArenaStatModifiers,
  type ArenaIncidentKey,
} from "@/lib/games/arena-occupations";
import { prisma } from "@/lib/db/prisma";
import {
  ARENA_MAX_ATTRIBUTE,
  ARENA_MAX_LEVEL,
  arenaCatalogItem,
  arenaEquipmentModifiers,
  arenaExperienceForLevel,
} from "@/lib/games/arena-economy";
import {
  arenaAppearanceSchema,
  createArenaGladiatorSchema,
  equipArenaItemSchema,
  purchaseArenaItemSchema,
  purchaseArenaShelterItemSchema,
  resetArenaGladiatorSchema,
  spendArenaSkillPointSchema,
  upgradeArenaShelterSchema,
  updateArenaGladiatorSchema,
  type CreateArenaGladiatorInput,
  type EquipArenaItemInput,
  type PurchaseArenaItemInput,
  type PurchaseArenaShelterItemInput,
  type ResetArenaGladiatorInput,
  type SpendArenaSkillPointInput,
  type UpgradeArenaShelterInput,
  type UpdateArenaGladiatorInput,
} from "@/lib/validation/arena";
import { AppError, assertFound } from "@/server/errors";
import { assertArenaGladiatorAvailable } from "@/server/services/arena-availability";

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
  campaignStep: true,
  campaignCompletions: true,
  injuredUntil: true,
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
  shelter: {
    select: {
      level: true,
      points: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: [{ acquiredAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          catalogItemKey: true,
          acquiredAt: true,
        },
      },
    },
  },
  occupations: {
    where: { incident: { not: null } },
    orderBy: [{ finishedAt: "desc" as const }, { id: "desc" as const }],
    take: 10,
    select: { incident: true, effectExpiresAt: true },
  },
  outgoingRaids: {
    where: { status: "ACTIVE" as const },
    orderBy: { startedAt: "desc" as const },
    take: 1,
    select: { endsAt: true },
  },
  incomingRaids: {
    where: { status: "ACTIVE" as const },
    select: { id: true },
  },
  battles: {
    where: { status: { not: "ACTIVE" as const } },
    orderBy: [{ finishedAt: "desc" as const }, { id: "desc" as const }],
    take: 8,
    select: {
      id: true,
      opponentKey: true,
      status: true,
      round: true,
      goldReward: true,
      experienceReward: true,
      fameReward: true,
      shelterPointsReward: true,
      finishedAt: true,
    },
  },
} satisfies Prisma.ArenaGladiatorSelect;

type StoredGladiator = Prisma.ArenaGladiatorGetPayload<{ select: typeof gladiatorSelect }>;

function serializeGladiator(gladiator: StoredGladiator) {
  const { battles, shelter, occupations, outgoingRaids, incomingRaids, injuredUntil, ...record } =
    gladiator;
  if (!shelter) throw new AppError("O Refúgio deste gladiador não foi encontrado.", 500);
  const attributes = {
    strength: gladiator.strength,
    agility: gladiator.agility,
    technique: gladiator.technique,
    defence: gladiator.defence,
    vitality: gladiator.vitality,
    presence: gladiator.presence,
    stamina: gladiator.stamina,
  };
  const equippedKeys = gladiator.inventory
    .filter((item) => item.equippedSlot)
    .map((item) => item.catalogItemKey);
  const equipmentModifiers = arenaEquipmentModifiers(equippedKeys);
  const statusEffects = arenaActiveOccupationEffects(
    occupations.map((occupation) => ({
      incident: occupation.incident as ArenaIncidentKey | null,
      effectExpiresAt: occupation.effectExpiresAt,
    })),
  );
  const temporaryModifiers = arenaOccupationEffectModifiers(statusEffects);
  const currentLevelExperience = arenaExperienceForLevel(gladiator.level);
  const isMaximumLevel = gladiator.level >= ARENA_MAX_LEVEL;
  const nextLevelExperience = isMaximumLevel
    ? currentLevelExperience
    : arenaExperienceForLevel(gladiator.level + 1);
  return {
    ...record,
    appearance: arenaAppearanceSchema.parse(gladiator.appearance),
    attributes,
    derived: arenaDerivedStats(
      attributes,
      combineArenaStatModifiers(equipmentModifiers, temporaryModifiers),
    ),
    equipmentModifiers,
    temporaryModifiers,
    statusEffects: statusEffects.map((effect) => ({
      ...effect,
      expiresAt: effect.expiresAt.toISOString(),
    })),
    condition: {
      injured: Boolean(injuredUntil && injuredUntil > new Date()),
      injuredUntil: injuredUntil?.toISOString() ?? null,
    },
    pvp: {
      activeRaidEndsAt: outgoingRaids[0]?.endsAt.toISOString() ?? null,
      incomingActiveCount: incomingRaids.length,
    },
    progression: {
      currentLevelExperience,
      nextLevelExperience,
      experienceIntoLevel: isMaximumLevel
        ? 0
        : Math.max(0, gladiator.experience - currentLevelExperience),
      experienceNeeded: isMaximumLevel ? 0 : nextLevelExperience - currentLevelExperience,
      isMaximum: isMaximumLevel,
      maxLevel: ARENA_MAX_LEVEL,
    },
    campaign: arenaCampaignProgress(gladiator.campaignStep, gladiator.campaignCompletions),
    shelter: {
      ...arenaShelterProgress(shelter.level, shelter.points),
      stats: arenaShelterStats(
        shelter.level,
        shelter.items.map((item) => item.catalogItemKey),
      ),
      items: shelter.items.map((item) => ({
        ...item,
        catalog: arenaShelterItem(item.catalogItemKey),
        acquiredAt: item.acquiredAt.toISOString(),
      })),
      createdAt: shelter.createdAt.toISOString(),
      updatedAt: shelter.updatedAt.toISOString(),
    },
    legacy: arenaLegacy({
      wins: gladiator.wins,
      losses: gladiator.losses,
      fame: gladiator.fame,
      campaignCompletions: gladiator.campaignCompletions,
      inventoryCount: gladiator.inventory.length,
    }),
    createdAt: gladiator.createdAt.toISOString(),
    updatedAt: gladiator.updatedAt.toISOString(),
    inventory: gladiator.inventory.map((item) => ({
      ...item,
      catalog: arenaCatalogItem(item.catalogItemKey),
      acquiredAt: item.acquiredAt.toISOString(),
    })),
    history: battles.map((battle) => ({
      ...battle,
      opponentName: arenaOpponent(battle.opponentKey)?.name ?? "Adversário desconhecido",
      finishedAt: battle.finishedAt?.toISOString() ?? null,
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

export async function listArenaLeaderboard(userId: string, communityId: string) {
  await membership(prisma, userId, communityId);
  const gladiators = await prisma.arenaGladiator.findMany({
    where: { communityId },
    orderBy: [
      { campaignCompletions: "desc" },
      { fame: "desc" },
      { wins: "desc" },
      { name: "asc" },
      { id: "asc" },
    ],
    take: 20,
    select: {
      id: true,
      userId: true,
      name: true,
      level: true,
      fame: true,
      wins: true,
      campaignStep: true,
      campaignCompletions: true,
      appearance: true,
    },
  });
  return gladiators.map((gladiator, index) => ({
    rank: index + 1,
    ...gladiator,
    appearance: arenaAppearanceSchema.parse(gladiator.appearance),
  }));
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
          origin: input.data.origin,
          entryLine: input.data.entryLine || null,
          victoryLine: input.data.victoryLine || null,
          appearance: input.data.appearance,
          ...input.data.attributes,
          shelter: { create: {} },
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
    await lockedGladiator(db, userId, communityId);
    const gladiator = await db.arenaGladiator.update({
      where: { communityId_userId: { communityId, userId } },
      data: {
        name: input.data.name,
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

async function lockedGladiator(db: Prisma.TransactionClient, userId: string, communityId: string) {
  await membership(db, userId, communityId);
  const owned = assertFound(
    await db.arenaGladiator.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    }),
    "Crie seu gladiador antes de usar a Arena.",
  );
  await db.$queryRaw`SELECT "id" FROM "ArenaGladiator" WHERE "id" = ${owned.id}::uuid FOR UPDATE`;
  await assertArenaGladiatorAvailable(db, owned.id);
  return assertFound(
    await db.arenaGladiator.findUnique({ where: { id: owned.id }, select: gladiatorSelect }),
    "Gladiador não encontrado.",
  );
}

export async function resetArenaGladiator(
  userId: string,
  communityId: string,
  rawInput: ResetArenaGladiatorInput,
) {
  const input = resetArenaGladiatorSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Confirmação inválida.");
  return transaction(async (db) => {
    const gladiator = await lockedGladiator(db, userId, communityId);
    if (input.data.confirmation !== gladiator.name)
      throw new AppError("Digite exatamente o nome atual do gladiador para confirmar.", 409);
    const incomingRaid = await db.arenaPvpRaid.findFirst({
      where: { defenderId: gladiator.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (incomingRaid)
      throw new AppError("Aguarde o ataque ao seu Refúgio terminar antes de reiniciar.", 409);
    await db.arenaGladiator.delete({ where: { id: gladiator.id } });
    return { deleted: true as const };
  });
}

export async function upgradeArenaShelter(
  userId: string,
  communityId: string,
  rawInput: UpgradeArenaShelterInput,
) {
  const input = upgradeArenaShelterSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Ação inválida.");

  return transaction(async (db) => {
    const gladiator = await lockedGladiator(db, userId, communityId);
    const shelter = assertFound(gladiator.shelter, "O Refúgio deste gladiador não foi encontrado.");
    const progress = arenaShelterProgress(shelter.level, shelter.points);
    if (progress.isMaximum) throw new AppError("Seu Refúgio já alcançou o nível máximo.", 409);
    if (!progress.canUpgrade || progress.nextCost === null)
      throw new AppError(
        `Você precisa de ${progress.nextCost ?? 0} pontos de Refúgio para esta melhoria.`,
        409,
      );

    await db.arenaShelter.update({
      where: { gladiatorId: gladiator.id },
      data: {
        level: { increment: 1 },
        points: { decrement: progress.nextCost },
      },
    });
    return serializeGladiator(
      assertFound(
        await db.arenaGladiator.findUnique({
          where: { id: gladiator.id },
          select: gladiatorSelect,
        }),
        "Gladiador não encontrado.",
      ),
    );
  });
}

export async function purchaseArenaItem(
  userId: string,
  communityId: string,
  rawInput: PurchaseArenaItemInput,
) {
  const input = purchaseArenaItemSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Item inválido.");
  const catalog = arenaCatalogItem(input.data.catalogItemKey);
  if (!catalog) throw new AppError("Item inválido.");

  try {
    return await transaction(async (db) => {
      const gladiator = await lockedGladiator(db, userId, communityId);
      if (gladiator.inventory.some((item) => item.catalogItemKey === catalog.key))
        throw new AppError("Você já possui este equipamento.", 409, "CONFLICT");
      if (gladiator.level < catalog.requiredLevel)
        throw new AppError(`Este equipamento exige o nível ${catalog.requiredLevel}.`, 409);
      if (gladiator.gold < catalog.price)
        throw new AppError("Moedas insuficientes para esta compra.", 409);

      await db.arenaGladiator.update({
        where: { id: gladiator.id },
        data: {
          gold: { decrement: catalog.price },
          inventory: {
            create: {
              catalogItemKey: catalog.key,
              metadata: {
                catalogVersion: catalog.version,
                purchasePrice: catalog.price,
                purchasedName: catalog.name,
              },
            },
          },
        },
      });
      return serializeGladiator(
        assertFound(
          await db.arenaGladiator.findUnique({
            where: { id: gladiator.id },
            select: gladiatorSelect,
          }),
          "Gladiador não encontrado.",
        ),
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Você já possui este equipamento.", 409, "CONFLICT");
    throw error;
  }
}

export async function purchaseArenaShelterItem(
  userId: string,
  communityId: string,
  rawInput: PurchaseArenaShelterItemInput,
) {
  const input = purchaseArenaShelterItemSchema.safeParse(rawInput);
  if (!input.success)
    throw new AppError(input.error.issues[0]?.message ?? "Item do Acampamento inválido.");
  const catalog = arenaShelterItem(input.data.catalogItemKey);
  if (!catalog) throw new AppError("Item do Acampamento inválido.");

  try {
    return await transaction(async (db) => {
      const gladiator = await lockedGladiator(db, userId, communityId);
      const shelter = assertFound(
        gladiator.shelter,
        "O Refúgio deste gladiador não foi encontrado.",
      );
      if (shelter.items.some((item) => item.catalogItemKey === catalog.key))
        throw new AppError("Seu Acampamento já possui este item.", 409, "CONFLICT");
      if (shelter.level < catalog.requiredLevel)
        throw new AppError(`Este item exige Acampamento nível ${catalog.requiredLevel}.`, 409);
      if (gladiator.gold < catalog.price)
        throw new AppError("Moedas insuficientes para esta melhoria.", 409);

      await db.arenaGladiator.update({
        where: { id: gladiator.id },
        data: {
          gold: { decrement: catalog.price },
          shelter: {
            update: {
              items: { create: { catalogItemKey: catalog.key } },
            },
          },
        },
      });
      return serializeGladiator(
        assertFound(
          await db.arenaGladiator.findUnique({
            where: { id: gladiator.id },
            select: gladiatorSelect,
          }),
          "Gladiador não encontrado.",
        ),
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError("Seu Acampamento já possui este item.", 409, "CONFLICT");
    throw error;
  }
}

export async function setArenaItemEquipped(
  userId: string,
  communityId: string,
  itemId: string,
  rawInput: EquipArenaItemInput,
) {
  const input = equipArenaItemSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Ação inválida.");

  return transaction(async (db) => {
    const gladiator = await lockedGladiator(db, userId, communityId);
    const item = assertFound(
      gladiator.inventory.find((entry) => entry.id === itemId),
      "Equipamento não encontrado.",
    );
    const catalog = assertFound(
      arenaCatalogItem(item.catalogItemKey),
      "Este equipamento não pertence mais ao catálogo.",
    );

    if (input.data.equipped) {
      await db.arenaInventoryItem.updateMany({
        where: { gladiatorId: gladiator.id, equippedSlot: catalog.slot },
        data: { equippedSlot: null },
      });
      await db.arenaInventoryItem.update({
        where: { id: item.id },
        data: { equippedSlot: catalog.slot },
      });
    } else {
      await db.arenaInventoryItem.update({
        where: { id: item.id },
        data: { equippedSlot: null },
      });
    }

    return serializeGladiator(
      assertFound(
        await db.arenaGladiator.findUnique({
          where: { id: gladiator.id },
          select: gladiatorSelect,
        }),
        "Gladiador não encontrado.",
      ),
    );
  });
}

export async function spendArenaSkillPoint(
  userId: string,
  communityId: string,
  rawInput: SpendArenaSkillPointInput,
) {
  const input = spendArenaSkillPointSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Atributo inválido.");

  return transaction(async (db) => {
    const gladiator = await lockedGladiator(db, userId, communityId);
    const attribute = input.data.attribute as ArenaAttributeKey;
    if (gladiator.unspentSkillPoints < 1)
      throw new AppError("Você não possui pontos de atributo disponíveis.", 409);
    if (gladiator[attribute] >= ARENA_MAX_ATTRIBUTE)
      throw new AppError(`Este atributo já atingiu o limite ${ARENA_MAX_ATTRIBUTE}.`, 409);

    await db.arenaGladiator.update({
      where: { id: gladiator.id },
      data: {
        unspentSkillPoints: { decrement: 1 },
        [attribute]: { increment: 1 },
      },
    });
    return serializeGladiator(
      assertFound(
        await db.arenaGladiator.findUnique({
          where: { id: gladiator.id },
          select: gladiatorSelect,
        }),
        "Gladiador não encontrado.",
      ),
    );
  });
}

export type ArenaGladiatorProfile = NonNullable<Awaited<ReturnType<typeof getArenaGladiator>>>;
export type ArenaLeaderboard = Awaited<ReturnType<typeof listArenaLeaderboard>>;
