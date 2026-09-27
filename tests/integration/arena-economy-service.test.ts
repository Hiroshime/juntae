import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_ARENA_APPEARANCE, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";
import { startArenaBattle } from "@/server/services/arena-battle-service";
import {
  createArenaGladiator,
  getArenaGladiator,
  purchaseArenaItem,
  purchaseArenaShelterItem,
  setArenaItemEquipped,
  spendArenaSkillPoint,
  upgradeArenaShelter,
} from "@/server/services/arena-service";

describe("economia e progressão persistentes da Arena", () => {
  const suffix = randomUUID();
  let communityId: string;
  let ownerId: string;
  let memberId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "member"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `arena-economy-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, memberId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arena Economy",
          slug: `arena-economy-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: memberId, role: "MEMBER" },
            ],
          },
        },
      })
    ).id;
  });

  afterEach(async () => {
    if (communityId) await prisma.arenaGladiator.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId].filter(Boolean) } } });
  });

  function payload(name: string) {
    return {
      name,
      origin: "MONTES_FERRO" as const,
      entryLine: "A forja me trouxe até aqui.",
      victoryLine: "Aço e disciplina.",
      appearance: DEFAULT_ARENA_APPEARANCE,
      attributes: DEFAULT_ARENA_ATTRIBUTES,
    };
  }

  it("compra uma vez, desconta o preço e aplica o equipamento ao próximo duelo", async () => {
    await createArenaGladiator(ownerId, communityId, payload("Cassius"));
    const purchased = await purchaseArenaItem(ownerId, communityId, {
      catalogItemKey: "COPPER_SHORT_SWORD",
    });
    expect(purchased).toMatchObject({ gold: 320, inventory: [{ equippedSlot: null }] });
    await expect(
      purchaseArenaItem(ownerId, communityId, { catalogItemKey: "COPPER_SHORT_SWORD" }),
    ).rejects.toMatchObject({ status: 409 });

    const equipped = await setArenaItemEquipped(ownerId, communityId, purchased.inventory[0].id, {
      equipped: true,
    });
    expect(equipped.derived.baseDamage).toBe(10);
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    expect(battle.player.derived.baseDamage).toBe(10);
    expect(battle.player.equipment).toEqual(["COPPER_SHORT_SWORD"]);

    await setArenaItemEquipped(ownerId, communityId, purchased.inventory[0].id, {
      equipped: false,
    });
    const sameBattle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "NARA_VENTO_DE_COBRE",
    });
    expect(sameBattle.id).toBe(battle.id);
    expect(sameBattle.player.equipment).toEqual(["COPPER_SHORT_SWORD"]);
  });

  it("substitui atomicamente o item do mesmo slot e protege propriedade", async () => {
    const owner = await createArenaGladiator(ownerId, communityId, payload("Lysandra"));
    await createArenaGladiator(memberId, communityId, payload("Borin"));
    await prisma.arenaGladiator.update({
      where: { id: owner.id },
      data: { level: 2, gold: 1_000 },
    });
    const swordProfile = await purchaseArenaItem(ownerId, communityId, {
      catalogItemKey: "COPPER_SHORT_SWORD",
    });
    const spearProfile = await purchaseArenaItem(ownerId, communityId, {
      catalogItemKey: "DUELIST_SPEAR",
    });
    const sword = swordProfile.inventory.find(
      (item) => item.catalogItemKey === "COPPER_SHORT_SWORD",
    )!;
    const spear = spearProfile.inventory.find((item) => item.catalogItemKey === "DUELIST_SPEAR")!;
    await setArenaItemEquipped(ownerId, communityId, sword.id, { equipped: true });
    const switched = await setArenaItemEquipped(ownerId, communityId, spear.id, { equipped: true });
    expect(switched.inventory.filter((item) => item.equippedSlot === "WEAPON")).toHaveLength(1);
    expect(switched.inventory.find((item) => item.id === spear.id)?.equippedSlot).toBe("WEAPON");
    await expect(
      setArenaItemEquipped(memberId, communityId, spear.id, { equipped: true }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("serializa o gasto de pontos e impede saldo negativo", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload("Aurora"));
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { unspentSkillPoints: 2 },
    });
    const attempts = await Promise.all([
      spendArenaSkillPoint(ownerId, communityId, { attribute: "strength" }),
      spendArenaSkillPoint(ownerId, communityId, { attribute: "agility" }),
    ]);
    expect(attempts).toHaveLength(2);
    const updated = await getArenaGladiator(ownerId, communityId);
    expect(updated).toMatchObject({
      unspentSkillPoints: 0,
      attributes: { strength: 4, agility: 4 },
    });
    await expect(
      spendArenaSkillPoint(ownerId, communityId, { attribute: "strength" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("bloqueia compra sem nível ou moedas", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload("Nara"));
    await expect(
      purchaseArenaItem(ownerId, communityId, { catalogItemKey: "IRON_MAUL" }),
    ).rejects.toMatchObject({ status: 409 });
    await prisma.arenaGladiator.update({ where: { id: profile.id }, data: { level: 3, gold: 10 } });
    await expect(
      purchaseArenaItem(ownerId, communityId, { catalogItemKey: "IRON_MAUL" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("cria e melhora o Refúgio sem permitir gasto duplicado", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload("Cassius Solar"));
    expect(profile.shelter).toMatchObject({
      level: 1,
      points: 0,
      nextCost: 8,
      canUpgrade: false,
    });
    await expect(upgradeArenaShelter(memberId, communityId, {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(upgradeArenaShelter(ownerId, communityId, {})).rejects.toMatchObject({
      status: 409,
    });
    await prisma.arenaShelter.update({
      where: { gladiatorId: profile.id },
      data: { points: 8 },
    });

    const attempts = await Promise.allSettled([
      upgradeArenaShelter(ownerId, communityId, {}),
      upgradeArenaShelter(ownerId, communityId, {}),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.arenaShelter.findUnique({ where: { gladiatorId: profile.id } }),
    ).toMatchObject({ level: 2, points: 0 });
    expect(await getArenaGladiator(ownerId, communityId)).toMatchObject({
      shelter: { level: 2, name: "Cabana do combatente", nextCost: 18 },
    });

    await prisma.arenaShelter.update({
      where: { gladiatorId: profile.id },
      data: { level: 6, points: 110 },
    });
    const palace = await upgradeArenaShelter(ownerId, communityId, {});
    expect(palace.shelter).toMatchObject({
      level: 7,
      name: "Palácio dos estandartes",
      points: 0,
      nextCost: 150,
    });

    await prisma.arenaShelter.update({
      where: { gladiatorId: profile.id },
      data: { level: 10, points: 100 },
    });
    await expect(upgradeArenaShelter(ownerId, communityId, {})).rejects.toMatchObject({
      status: 409,
    });
  });

  it("compra melhorias únicas do Acampamento e calcula seus status", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload("Cassius Construtor"));
    const improved = await purchaseArenaShelterItem(ownerId, communityId, {
      catalogItemKey: "REINFORCED_CHEST",
    });
    expect(improved).toMatchObject({
      gold: 380,
      shelter: {
        stats: { defence: 3, supplies: 4 },
        items: [{ catalogItemKey: "REINFORCED_CHEST" }],
      },
    });
    await expect(
      purchaseArenaShelterItem(ownerId, communityId, {
        catalogItemKey: "REINFORCED_CHEST",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      purchaseArenaShelterItem(ownerId, communityId, {
        catalogItemKey: "TRAINING_DUMMY",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      purchaseArenaShelterItem(memberId, communityId, {
        catalogItemKey: "IRON_BRAZIER",
      }),
    ).rejects.toMatchObject({ status: 404 });

    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { gold: 1_000, shelter: { update: { level: 2 } } },
    });
    const attempts = await Promise.allSettled([
      purchaseArenaShelterItem(ownerId, communityId, { catalogItemKey: "TRAINING_DUMMY" }),
      purchaseArenaShelterItem(ownerId, communityId, { catalogItemKey: "TRAINING_DUMMY" }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.arenaShelterItem.count({
        where: { shelterId: profile.id, catalogItemKey: "TRAINING_DUMMY" },
      }),
    ).toBe(1);

    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { gold: 5_000, shelter: { update: { level: 10 } } },
    });
    const legendaryCamp = await purchaseArenaShelterItem(ownerId, communityId, {
      catalogItemKey: "ETERNAL_FLAME",
    });
    expect(legendaryCamp).toMatchObject({
      gold: 1_800,
      shelter: {
        level: 10,
        stats: { defence: 24, comfort: 13, supplies: 16, training: 17, prestige: 29 },
      },
    });
  });
});
