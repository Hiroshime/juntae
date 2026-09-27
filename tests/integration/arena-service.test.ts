import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ARENA_APPEARANCE, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";
import { prisma } from "@/lib/db/prisma";
import { startArenaBattle } from "@/server/services/arena-battle-service";
import {
  createArenaGladiator,
  getArenaGladiator,
  listArenaLeaderboard,
  purchaseArenaItem,
  resetArenaGladiator,
  updateArenaGladiator,
} from "@/server/services/arena-service";

describe("fundação da Arena dos Campeões", () => {
  const suffix = randomUUID();
  let communityId: string;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `arena-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arena E2E",
          slug: `arena-${suffix}`,
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
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  function payload() {
    return {
      name: "Lysandra do Sol",
      origin: "TERRAS_RUBRAS" as const,
      entryLine: "A aurora chegou.",
      victoryLine: "Honrem a areia.",
      appearance: DEFAULT_ARENA_APPEARANCE,
      attributes: DEFAULT_ARENA_ATTRIBUTES,
    };
  }

  it("mantém o perfil privado para membros da própria comunidade", async () => {
    await expect(getArenaGladiator(outsiderId, communityId)).rejects.toMatchObject({ status: 404 });
    await expect(createArenaGladiator(outsiderId, communityId, payload())).rejects.toMatchObject({
      status: 404,
    });
    expect(await getArenaGladiator(ownerId, communityId)).toBeNull();
  });

  it("cria uma única ficha persistente com recursos e inventário iniciais", async () => {
    const attempts = await Promise.allSettled([
      createArenaGladiator(ownerId, communityId, payload()),
      createArenaGladiator(ownerId, communityId, payload()),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const profile = await getArenaGladiator(ownerId, communityId);
    expect(profile).toMatchObject({
      name: "Lysandra do Sol",
      level: 1,
      gold: 500,
      fame: 0,
      wins: 0,
      losses: 0,
      campaignStep: 0,
      campaignCompletions: 0,
      campaign: { step: 0, completions: 0, opponentKey: "CAIO_DO_PATIO" },
      attributes: DEFAULT_ARENA_ATTRIBUTES,
      derived: { maxHealth: 56, maxEnergy: 40 },
      inventory: [],
    });
    expect(await prisma.arenaGladiator.count({ where: { communityId, userId: ownerId } })).toBe(1);
  });

  it("classifica a comunidade por campanhas, fama e vitórias", async () => {
    const owner = await createArenaGladiator(ownerId, communityId, payload());
    const member = await createArenaGladiator(memberId, communityId, {
      ...payload(),
      name: "Borin",
    });
    await Promise.all([
      prisma.arenaGladiator.update({
        where: { id: owner.id },
        data: { campaignCompletions: 1, fame: 40, wins: 8 },
      }),
      prisma.arenaGladiator.update({
        where: { id: member.id },
        data: { campaignCompletions: 2, fame: 20, wins: 4 },
      }),
    ]);
    const ranking = await listArenaLeaderboard(ownerId, communityId);
    expect(ranking.map((entry) => [entry.rank, entry.name])).toEqual([
      [1, "Borin"],
      [2, "Lysandra do Sol"],
    ]);
    await expect(listArenaLeaderboard(outsiderId, communityId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("edita identidade e aparência sem permitir redistribuição de atributos", async () => {
    const created = await createArenaGladiator(memberId, communityId, payload());
    const updated = await updateArenaGladiator(memberId, communityId, {
      name: "Lysandra Tempestade",
      origin: "ILHAS_TORMENTA",
      entryLine: "O vento está comigo.",
      victoryLine: "A tempestade passou.",
      appearance: {
        ...DEFAULT_ARENA_APPEARANCE,
        hairStyle: "LONG",
        faceMark: "PAINT",
      },
    });
    expect(updated).toMatchObject({
      name: "Lysandra Tempestade",
      origin: "ILHAS_TORMENTA",
      attributes: created.attributes,
      appearance: { hairStyle: "LONG", faceMark: "PAINT" },
    });
    expect(await prisma.arenaGladiator.findUnique({ where: { id: created.id } })).toMatchObject({
      strength: 3,
      agility: 3,
      technique: 3,
    });
  });

  it("reinicia somente o personagem próprio com confirmação exata e exclusão em cascata", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload());
    await purchaseArenaItem(ownerId, communityId, { catalogItemKey: "COPPER_SHORT_SWORD" });
    const battle = await startArenaBattle(ownerId, communityId, { opponentKey: "CAIO_DO_PATIO" });
    await expect(
      resetArenaGladiator(ownerId, communityId, { confirmation: "Nome incorreto" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      resetArenaGladiator(outsiderId, communityId, { confirmation: profile.name }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      resetArenaGladiator(ownerId, communityId, { confirmation: profile.name }),
    ).resolves.toEqual({ deleted: true });
    expect(await getArenaGladiator(ownerId, communityId)).toBeNull();
    expect(await prisma.arenaInventoryItem.count({ where: { gladiatorId: profile.id } })).toBe(0);
    expect(await prisma.arenaBattle.count({ where: { id: battle.id } })).toBe(0);
    expect(await prisma.arenaOccupation.count({ where: { gladiatorId: profile.id } })).toBe(0);
    expect(await prisma.arenaShelter.count({ where: { gladiatorId: profile.id } })).toBe(0);
    expect(await prisma.arenaShelterItem.count({ where: { shelterId: profile.id } })).toBe(0);
    expect(
      (await listArenaLeaderboard(ownerId, communityId)).some((entry) => entry.id === profile.id),
    ).toBe(false);
  });

  it("rejeita uma distribuição manipulada antes de gravar", async () => {
    await expect(
      createArenaGladiator(ownerId, communityId, {
        ...payload(),
        attributes: { ...DEFAULT_ARENA_ATTRIBUTES, strength: 8 },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await prisma.arenaGladiator.count({ where: { communityId } })).toBe(0);
  });
});
