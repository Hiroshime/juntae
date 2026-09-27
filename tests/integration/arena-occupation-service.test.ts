import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_ARENA_APPEARANCE, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";
import { startArenaBattle } from "@/server/services/arena-battle-service";
import {
  getArenaOccupationHub,
  startArenaOccupation,
} from "@/server/services/arena-occupation-service";
import {
  createArenaGladiator,
  getArenaGladiator,
  purchaseArenaItem,
  purchaseArenaShelterItem,
  resetArenaGladiator,
  updateArenaGladiator,
  upgradeArenaShelter,
} from "@/server/services/arena-service";

describe("campo de treino e missões da Arena", () => {
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
            email: `arena-occupation-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, memberId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arena Occupations",
          slug: `arena-occupation-${suffix}`,
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
    await prisma.arenaGladiator.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  });

  function payload(name = "Cassius Labor") {
    return {
      name,
      origin: "MONTES_FERRO" as const,
      entryLine: "Disciplina vence batalhas.",
      victoryLine: "O esforço valeu.",
      appearance: DEFAULT_ARENA_APPEARANCE,
      attributes: DEFAULT_ARENA_ATTRIBUTES,
    };
  }

  it("conclui treino uma vez e bloqueia todas as mutações enquanto está ocupado", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload());
    const startedAt = new Date();
    const hub = await startArenaOccupation(
      ownerId,
      communityId,
      { taskKey: "FOUNDATION_DRILLS" },
      startedAt,
    );
    expect(hub.active).toMatchObject({ taskKey: "FOUNDATION_DRILLS", durationHours: 1 });
    await expect(
      purchaseArenaItem(ownerId, communityId, { catalogItemKey: "COPPER_SHORT_SWORD" }),
    ).rejects.toMatchObject({ status: 409, code: "ARENA_OCCUPIED" });
    await expect(upgradeArenaShelter(ownerId, communityId, {})).rejects.toMatchObject({
      code: "ARENA_OCCUPIED",
    });
    await expect(
      purchaseArenaShelterItem(ownerId, communityId, { catalogItemKey: "IRON_BRAZIER" }),
    ).rejects.toMatchObject({ code: "ARENA_OCCUPIED" });
    await expect(
      updateArenaGladiator(ownerId, communityId, {
        name: "Cassius II",
        origin: "MONTES_FERRO",
        entryLine: "Disciplina vence batalhas.",
        victoryLine: "O esforço valeu.",
        appearance: DEFAULT_ARENA_APPEARANCE,
      }),
    ).rejects.toMatchObject({ code: "ARENA_OCCUPIED" });
    await expect(
      resetArenaGladiator(ownerId, communityId, { confirmation: profile.name }),
    ).rejects.toMatchObject({ code: "ARENA_OCCUPIED" });
    await expect(
      startArenaBattle(ownerId, communityId, { opponentKey: "CAIO_DO_PATIO" }),
    ).rejects.toMatchObject({ code: "ARENA_OCCUPIED" });

    const beforeEnd = await getArenaOccupationHub(
      ownerId,
      communityId,
      new Date(startedAt.getTime() + 59 * 60_000),
    );
    expect(beforeEnd.active).not.toBeNull();
    const completed = await getArenaOccupationHub(
      ownerId,
      communityId,
      new Date(startedAt.getTime() + 60 * 60_000 + 1),
    );
    expect(completed.active).toBeNull();
    expect(completed.history[0]).toMatchObject({
      experienceReward: 25,
      shelterPointsReward: 1,
      incident: null,
    });
    await getArenaOccupationHub(
      ownerId,
      communityId,
      new Date(startedAt.getTime() + 2 * 60 * 60_000),
    );
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      experience: 25,
      gold: 500,
    });
    expect(
      await prisma.arenaShelter.findUnique({ where: { gladiatorId: profile.id } }),
    ).toMatchObject({ points: 1 });
  });

  it("impede atividades paralelas e início durante um duelo", async () => {
    await createArenaGladiator(ownerId, communityId, payload());
    const now = new Date();
    const attempts = await Promise.allSettled([
      startArenaOccupation(ownerId, communityId, { taskKey: "FOUNDATION_DRILLS" }, now),
      startArenaOccupation(ownerId, communityId, { taskKey: "MARKET_PATROL" }, now),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);

    await prisma.arenaOccupation.deleteMany({ where: { status: "ACTIVE" } });
    await startArenaBattle(ownerId, communityId, { opponentKey: "CAIO_DO_PATIO" });
    await expect(
      startArenaOccupation(ownerId, communityId, { taskKey: "FOUNDATION_DRILLS" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("registra incidente, aplica penalidade temporária e usa a ficha reduzida no combate", async () => {
    const profile = await createArenaGladiator(ownerId, communityId, payload());
    const startedAt = new Date();
    await startArenaOccupation(ownerId, communityId, { taskKey: "MARKET_PATROL" }, startedAt);
    const rolls = [0, 0.34];
    const completed = await getArenaOccupationHub(
      ownerId,
      communityId,
      new Date(startedAt.getTime() + 60 * 60_000 + 1),
      () => rolls.shift() ?? 1,
    );
    expect(completed.history[0]).toMatchObject({
      incident: "BRUISED",
      goldReward: 70,
      experienceReward: 20,
      shelterPointsReward: 2,
    });
    expect(completed.effects[0]).toMatchObject({ key: "BRUISED" });
    expect(await getArenaGladiator(ownerId, communityId)).toMatchObject({
      gold: 570,
      experience: 20,
      derived: { maxHealth: 46, guard: 6 },
      temporaryModifiers: { maxHealth: -10, guard: -2 },
    });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    expect(battle.player.derived).toMatchObject({ maxHealth: 46, guard: 6 });

    await prisma.arenaOccupation.updateMany({
      where: { gladiatorId: profile.id },
      data: { effectExpiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await getArenaGladiator(ownerId, communityId)).toMatchObject({
      derived: { maxHealth: 56, guard: 8 },
      temporaryModifiers: {},
    });
  });

  it("não expõe nem aceita atividade de quem não possui gladiador", async () => {
    expect(await getArenaOccupationHub(memberId, communityId)).toMatchObject({ tasks: [] });
    await expect(
      startArenaOccupation(memberId, communityId, { taskKey: "FOUNDATION_DRILLS" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
