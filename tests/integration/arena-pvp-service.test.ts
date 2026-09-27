import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_ARENA_APPEARANCE, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";
import { getArenaPvpHub, startArenaPvpRaid } from "@/server/services/arena-pvp-service";
import {
  createArenaGladiator,
  getArenaGladiator,
  purchaseArenaItem,
} from "@/server/services/arena-service";
import { startArenaOccupation } from "@/server/services/arena-occupation-service";

describe("incursões PvP persistentes", () => {
  const suffix = randomUUID();
  let communityId: string;
  let otherCommunityId: string;
  let attackerUserId: string;
  let defenderUserId: string;
  let secondTargetUserId: string;
  let outsiderUserId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["attacker", "defender", "target", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `arena-pvp-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [attackerUserId, defenderUserId, secondTargetUserId, outsiderUserId] = users.map(
      (user) => user.id,
    );
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arena PvP",
          slug: `arena-pvp-${suffix}`,
          createdById: attackerUserId,
          members: {
            create: [
              { userId: attackerUserId, role: "OWNER" },
              { userId: defenderUserId, role: "MEMBER" },
              { userId: secondTargetUserId, role: "MEMBER" },
            ],
          },
        },
      })
    ).id;
    otherCommunityId = (
      await prisma.community.create({
        data: {
          name: "Arena PvP isolada",
          slug: `arena-pvp-other-${suffix}`,
          createdById: outsiderUserId,
          members: { create: { userId: outsiderUserId, role: "OWNER" } },
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.arenaGladiator.deleteMany({
      where: { communityId: { in: [communityId, otherCommunityId] } },
    });
  });

  afterAll(async () => {
    await prisma.community.deleteMany({ where: { id: { in: [communityId, otherCommunityId] } } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [attackerUserId, defenderUserId, secondTargetUserId, outsiderUserId].filter(Boolean),
        },
      },
    });
  });

  function payload(name: string) {
    return {
      name,
      origin: "MONTES_FERRO" as const,
      entryLine: "Meu domínio permanece de pé.",
      victoryLine: "A muralha resistiu.",
      appearance: DEFAULT_ARENA_APPEARANCE,
      attributes: DEFAULT_ARENA_ATTRIBUTES,
    };
  }

  async function createCommunityFighters() {
    const attacker = await createArenaGladiator(attackerUserId, communityId, payload("Atacante"));
    const defender = await createArenaGladiator(defenderUserId, communityId, payload("Defensor"));
    const secondTarget = await createArenaGladiator(
      secondTargetUserId,
      communityId,
      payload("Segundo alvo"),
    );
    return { attacker, defender, secondTarget };
  }

  it("cria um saque, notifica o defensor e bloqueia todas as tarefas do atacante", async () => {
    const { defender } = await createCommunityFighters();
    const now = new Date("2026-09-25T12:00:00.000Z");
    const hub = await startArenaPvpRaid(
      attackerUserId,
      communityId,
      { defenderId: defender.id },
      now,
    );
    expect(hub.active).toMatchObject({
      status: "ACTIVE",
      durationMinutes: 60,
      defender: { name: "Defensor" },
    });
    expect(hub.active).not.toHaveProperty("attackerScore");
    expect(hub.active).not.toHaveProperty("defenderScore");
    expect(hub.active?.defender).toEqual({ name: "Defensor" });
    const defenderHub = await getArenaPvpHub(defenderUserId, communityId, now);
    expect(defenderHub.incoming[0]).toMatchObject({
      status: "ACTIVE",
      attacker: { name: "Atacante" },
    });
    const profile = await getArenaGladiator(attackerUserId, communityId);
    expect(profile?.pvp.activeRaidEndsAt).toBe(hub.active?.endsAt);
    await expect(
      startArenaOccupation(attackerUserId, communityId, { taskKey: "FOUNDATION_DRILLS" }, now),
    ).rejects.toMatchObject({ status: 409, code: "ARENA_PVP_OCCUPIED" });
    await expect(
      purchaseArenaItem(attackerUserId, communityId, { catalogItemKey: "COPPER_SHORT_SWORD" }),
    ).rejects.toMatchObject({ status: 409, code: "ARENA_PVP_OCCUPIED" });
  });

  it("expõe dos alvos somente identidade, duração e nível do Refúgio", async () => {
    await createCommunityFighters();
    const hub = await getArenaPvpHub(attackerUserId, communityId);
    const target = hub.targets.find((entry) => entry.name === "Defensor");

    expect(target).toBeDefined();
    expect(target).toMatchObject({ name: "Defensor", shelterLevel: 1, durationMinutes: 60 });
    expect(target).not.toHaveProperty("level");
    expect(target).not.toHaveProperty("wins");
    expect(target).not.toHaveProperty("losses");
    expect(target).not.toHaveProperty("equipment");
    expect(target).not.toHaveProperty("combatPower");
    expect(target).not.toHaveProperty("shelter");
  });

  it("aplica a fama negativa ao snapshot PvP sem revelar o debuff ao adversário", async () => {
    const { attacker, defender } = await createCommunityFighters();
    await prisma.arenaGladiator.update({ where: { id: attacker.id }, data: { fame: -1 } });

    const hub = await startArenaPvpRaid(attackerUserId, communityId, {
      defenderId: defender.id,
    });
    expect(hub.condition.famePenalty).toEqual({ maxEnergy: -10, accuracy: -8 });
    expect(hub.active?.attacker).toEqual({ name: "Atacante" });

    const raid = await prisma.arenaPvpRaid.findFirstOrThrow({
      where: { attackerId: attacker.id, status: "ACTIVE" },
      select: { attackerSnapshot: true },
    });
    expect(raid.attackerSnapshot).toMatchObject({
      derived: { maxEnergy: 30, accuracy: 51 },
    });
  });

  it("resolve uma vitória uma única vez, transfere moedas e concede XP", async () => {
    const { attacker, defender } = await createCommunityFighters();
    await prisma.arenaGladiator.update({
      where: { id: attacker.id },
      data: {
        level: 8,
        strength: 20,
        agility: 20,
        technique: 20,
        defence: 20,
        vitality: 20,
        presence: 20,
        stamina: 20,
      },
    });
    await prisma.arenaGladiator.update({ where: { id: defender.id }, data: { gold: 1_000 } });
    const now = new Date();
    const started = await startArenaPvpRaid(
      attackerUserId,
      communityId,
      { defenderId: defender.id },
      now,
    );
    const finish = new Date(new Date(started.active!.endsAt).getTime() + 1);
    const rolls = [0.999, 0];
    const [attackerHub, defenderHub] = await Promise.all([
      getArenaPvpHub(attackerUserId, communityId, finish, () => rolls.shift() ?? 0.999),
      getArenaPvpHub(defenderUserId, communityId, finish, () => 0),
    ]);
    expect(attackerHub.active).toBeNull();
    expect(
      [...attackerHub.outgoing, ...defenderHub.incoming].some(
        (raid) => raid.status === "ATTACKER_WON" && raid.goldStolen === 80,
      ),
    ).toBe(true);
    const [storedAttacker, storedDefender] = await Promise.all([
      prisma.arenaGladiator.findUniqueOrThrow({ where: { id: attacker.id } }),
      prisma.arenaGladiator.findUniqueOrThrow({ where: { id: defender.id } }),
    ]);
    expect(storedAttacker.gold).toBe(580);
    expect(storedDefender.gold).toBe(920);
    expect(storedAttacker.experience).toBe(40);
  });

  it("fere o atacante derrotado por 30 minutos e impede nova ação", async () => {
    const { attacker, defender } = await createCommunityFighters();
    await prisma.arenaGladiator.update({
      where: { id: defender.id },
      data: {
        level: 10,
        strength: 20,
        agility: 20,
        technique: 20,
        defence: 20,
        vitality: 20,
        presence: 20,
        stamina: 20,
        shelter: { update: { level: 6 } },
      },
    });
    const now = new Date();
    const started = await startArenaPvpRaid(
      attackerUserId,
      communityId,
      { defenderId: defender.id },
      now,
    );
    expect(started.active?.durationMinutes).toBe(120);
    const finish = new Date(new Date(started.active!.endsAt).getTime() + 1);
    const settled = await getArenaPvpHub(attackerUserId, communityId, finish, () => 0.5);
    expect(settled.outgoing[0]).toMatchObject({
      status: "DEFENDER_WON",
      goldStolen: 0,
      experienceReward: 30,
    });
    expect(settled.condition.injured).toBe(true);
    expect(new Date(settled.condition.injuredUntil!).getTime()).toBe(
      new Date(started.active!.endsAt).getTime() + 30 * 60_000,
    );
    await expect(
      purchaseArenaItem(attackerUserId, communityId, { catalogItemKey: "COPPER_SHORT_SWORD" }),
    ).rejects.toMatchObject({ status: 409, code: "ARENA_INJURED" });
    const stored = await prisma.arenaGladiator.findUniqueOrThrow({ where: { id: attacker.id } });
    expect(stored.experience).toBe(30);
  });

  it("isola comunidades e mantém no máximo um saque ativo sob concorrência", async () => {
    const { defender, secondTarget } = await createCommunityFighters();
    const outsider = await createArenaGladiator(
      outsiderUserId,
      otherCommunityId,
      payload("Forasteiro"),
    );
    await expect(
      startArenaPvpRaid(attackerUserId, communityId, { defenderId: outsider.id }),
    ).rejects.toMatchObject({ status: 404 });

    const attempts = await Promise.allSettled([
      startArenaPvpRaid(attackerUserId, communityId, { defenderId: defender.id }),
      startArenaPvpRaid(attackerUserId, communityId, { defenderId: secondTarget.id }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.arenaPvpRaid.count({
        where: {
          attackerId: (await getArenaGladiator(attackerUserId, communityId))!.id,
          status: "ACTIVE",
        },
      }),
    ).toBe(1);
  });
});
