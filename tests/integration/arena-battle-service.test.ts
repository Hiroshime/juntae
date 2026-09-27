import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ARENA_APPEARANCE, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";
import { prisma } from "@/lib/db/prisma";
import {
  abandonArenaBattle,
  getActiveArenaBattle,
  playArenaBattleAction,
  startArenaBattle,
} from "@/server/services/arena-battle-service";
import { createArenaGladiator, getArenaGladiator } from "@/server/services/arena-service";

describe("combate persistente da Arena", () => {
  const suffix = randomUUID();
  let communityId: string;
  let ownerId: string;
  let outsiderId: string;

  beforeAll(async () => {
    const [owner, outsider] = await Promise.all(
      ["owner", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `arena-battle-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    ownerId = owner.id;
    outsiderId = outsider.id;
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arena Battle",
          slug: `arena-battle-${suffix}`,
          createdById: ownerId,
          members: { create: [{ userId: ownerId, role: "OWNER" }] },
        },
      })
    ).id;
  });

  afterEach(async () => {
    if (communityId) await prisma.arenaGladiator.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId].filter(Boolean) } } });
  });

  async function gladiator() {
    return createArenaGladiator(ownerId, communityId, {
      name: "Lysandra Solar",
      origin: "ILHAS_TORMENTA",
      entryLine: "A aurora chegou.",
      victoryLine: "Honrem a areia.",
      appearance: DEFAULT_ARENA_APPEARANCE,
      attributes: DEFAULT_ARENA_ATTRIBUTES,
    });
  }

  it("isola o duelo e cria no máximo um ativo mesmo com início concorrente", async () => {
    const profile = await gladiator();
    await expect(
      startArenaBattle(outsiderId, communityId, { opponentKey: "CAIO_DO_PATIO" }),
    ).rejects.toMatchObject({ status: 404 });

    const starts = await Promise.all([
      startArenaBattle(ownerId, communityId, { opponentKey: "CAIO_DO_PATIO" }),
      startArenaBattle(ownerId, communityId, { opponentKey: "CAIO_DO_PATIO" }),
    ]);
    expect(new Set(starts.map((battle) => battle.id))).toHaveLength(1);
    expect(
      await prisma.arenaBattle.count({ where: { gladiatorId: profile.id, status: "ACTIVE" } }),
    ).toBe(1);
    expect((await getActiveArenaBattle(ownerId, communityId))?.id).toBe(starts[0].id);
  });

  it("persiste a rodada e rejeita uma repetição com número obsoleto", async () => {
    await gladiator();
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    const updated = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "ADVANCE", round: 1 },
      () => 0,
    );
    expect(updated).toMatchObject({ status: "ACTIVE", round: 2, distance: 2 });
    expect(updated.turns[0]).toMatchObject({ round: 1, playerAction: "ADVANCE" });
    await expect(
      playArenaBattleAction(
        ownerId,
        communityId,
        battle.id,
        { action: "ADVANCE", round: 1 },
        () => 0,
      ),
    ).rejects.toMatchObject({ status: 409, code: "STALE_ROUND" });
    expect(await prisma.arenaBattleTurn.count({ where: { battleId: battle.id } })).toBe(1);
  });

  it("bloqueia portões futuros e avança somente ao vencer o alvo atual", async () => {
    const profile = await gladiator();
    await expect(
      startArenaBattle(ownerId, communityId, { opponentKey: "NARA_VENTO_DE_COBRE" }),
    ).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_LOCKED" });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      campaignStep: 1,
      campaignCompletions: 0,
    });

    const rematch = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    await prisma.arenaBattle.update({
      where: { id: rematch.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    await playArenaBattleAction(
      ownerId,
      communityId,
      rematch.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );
    expect(
      (await prisma.arenaGladiator.findUnique({ where: { id: profile.id } }))?.campaignStep,
    ).toBe(1);
  });

  it("aceita exatamente uma ação quando a mesma rodada chega em concorrência", async () => {
    await gladiator();
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    const attempts = await Promise.allSettled([
      playArenaBattleAction(
        ownerId,
        communityId,
        battle.id,
        { action: "ADVANCE", round: 1 },
        () => 0,
      ),
      playArenaBattleAction(
        ownerId,
        communityId,
        battle.id,
        { action: "ADVANCE", round: 1 },
        () => 0,
      ),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(await prisma.arenaBattleTurn.count({ where: { battleId: battle.id } })).toBe(1);
  });

  it("registra a vitória uma única vez quando ocorre o nocaute", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { experience: 140 },
    });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    const result = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );
    expect(result.status).toBe("WON");
    expect(result.opponent.health).toBe(0);
    expect(result.rewards).toEqual({
      gold: 90,
      experience: 60,
      fame: 2,
      skillPoints: 2,
      shelterPoints: 3,
    });
    await expect(
      playArenaBattleAction(
        ownerId,
        communityId,
        battle.id,
        { action: "QUICK_STRIKE", round: 1 },
        () => 0,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      wins: 1,
      gold: 590,
      experience: 200,
      fame: 2,
      level: 2,
      unspentSkillPoints: 2,
    });
    expect(await getArenaGladiator(ownerId, communityId)).toMatchObject({
      legacy: {
        totalBattles: 1,
        winRate: 100,
        unlockedCount: 1,
      },
      shelter: { level: 1, points: 3 },
      history: [
        expect.objectContaining({
          id: battle.id,
          opponentName: "Caio do Pátio",
          status: "WON",
          goldReward: 90,
          shelterPointsReward: 3,
        }),
      ],
    });
  });

  it("abandona como derrota sem duplicar o histórico", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({ where: { id: profile.id }, data: { campaignStep: 2 } });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "BORIN_MURALHA",
    });
    expect((await abandonArenaBattle(ownerId, communityId, battle.id)).status).toBe("ABANDONED");
    expect((await abandonArenaBattle(ownerId, communityId, battle.id)).status).toBe("ABANDONED");
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      losses: 1,
      campaignStep: 2,
    });
    expect(await getActiveArenaBattle(ownerId, communityId)).toBeNull();
    expect(
      await prisma.arenaShelter.findUnique({ where: { gladiatorId: profile.id } }),
    ).toMatchObject({ points: 0 });
  });

  it("concede um ponto de Refúgio na derrota concluída", async () => {
    const profile = await gladiator();
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CAIO_DO_PATIO",
    });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { playerHealth: 1, opponentPosition: 3 },
    });
    const result = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "RECOVER", round: 1 },
      () => 0,
    );
    expect(result).toMatchObject({
      status: "LOST",
      rewards: { gold: 0, experience: 15, fame: 0, shelterPoints: 1 },
    });
    expect(
      await prisma.arenaShelter.findUnique({ where: { gladiatorId: profile.id } }),
    ).toMatchObject({ points: 1 });
  });

  it("premia a chefe, conclui a campanha e reinicia o caminho", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { campaignStep: 3 },
    });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "AURELIA_CAMPEA_SOLAR",
    });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    const result = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );
    expect(result.rewards).toMatchObject({ gold: 450, experience: 220, fame: 15 });
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      campaignStep: 0,
      campaignCompletions: 1,
      wins: 1,
    });
    expect(
      await prisma.arenaShelter.findUnique({ where: { gladiatorId: profile.id } }),
    ).toMatchObject({ points: 12 });
  });

  it("usa a liga procedural atual, bloqueia outras ligas e escala a recompensa", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { campaignCompletions: 1, campaignStep: 0 },
    });

    await expect(
      startArenaBattle(ownerId, communityId, { opponentKey: "CHALLENGER_C2_S0" }),
    ).rejects.toMatchObject({ status: 409 });

    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CHALLENGER_C1_S0",
    });
    expect(battle.opponent).toMatchObject({ level: 6, key: "CHALLENGER_C1_S0" });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    const result = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );

    expect(result.rewards).toMatchObject({ gold: 420, experience: 1320, fame: 4 });
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      campaignStep: 1,
      campaignCompletions: 1,
      level: 4,
      unspentSkillPoints: 6,
    });
  });

  it("permite a liga anterior sem avançar a atual e bloqueia ligas mais antigas", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { campaignCompletions: 2, campaignStep: 0 },
    });

    const rematch = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CHALLENGER_C1_S3",
    });
    expect(rematch.opponent).toMatchObject({ key: "CHALLENGER_C1_S3", level: 9 });
    await prisma.arenaBattle.update({
      where: { id: rematch.id },
      data: { opponentHealth: 1, opponentPosition: 3 },
    });
    const result = await playArenaBattleAction(
      ownerId,
      communityId,
      rematch.id,
      { action: "QUICK_STRIKE", round: 1 },
      () => 0,
    );

    expect(result.status).toBe("WON");
    expect(result.rewards.experience).toBeGreaterThan(0);
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      campaignCompletions: 2,
      campaignStep: 0,
    });
    await expect(
      startArenaBattle(ownerId, communityId, { opponentKey: "AURELIA_CAMPEA_SOLAR" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      startArenaBattle(ownerId, communityId, { opponentKey: "CHALLENGER_C2_S1" }),
    ).rejects.toMatchObject({ status: 409, code: "CAMPAIGN_LOCKED" });
  });

  it("perde fama na Liga 6, respeita o piso e inicia o próximo duelo penalizado", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { campaignCompletions: 5, campaignStep: 0, fame: 0 },
    });

    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CHALLENGER_C5_S0",
    });
    await prisma.arenaBattle.update({
      where: { id: battle.id },
      data: { playerHealth: 1, opponentPosition: 3 },
    });
    const defeat = await playArenaBattleAction(
      ownerId,
      communityId,
      battle.id,
      { action: "RECOVER", round: 1 },
      () => 0,
    );

    expect(defeat).toMatchObject({ status: "LOST", rewards: { fame: -1 } });
    expect(await prisma.arenaGladiator.findUnique({ where: { id: profile.id } })).toMatchObject({
      fame: -1,
      campaignCompletions: 5,
      campaignStep: 0,
    });

    const penalized = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CHALLENGER_C5_S0",
    });
    expect(penalized.player).toMatchObject({
      famePenalty: { maxEnergy: -10, accuracy: -8 },
      energy: 30,
      derived: { maxEnergy: 30, accuracy: 51 },
    });
    await prisma.arenaBattle.update({
      where: { id: penalized.id },
      data: { playerHealth: 1, opponentPosition: 3 },
    });
    const floorDefeat = await playArenaBattleAction(
      ownerId,
      communityId,
      penalized.id,
      { action: "RECOVER", round: 1 },
      () => 0,
    );
    expect(floorDefeat.rewards.fame).toBe(0);
    expect((await prisma.arenaGladiator.findUnique({ where: { id: profile.id } }))?.fame).toBe(-1);
  });

  it("aplica a perda de fama ao abandonar um duelo da Liga 6", async () => {
    const profile = await gladiator();
    await prisma.arenaGladiator.update({
      where: { id: profile.id },
      data: { campaignCompletions: 5, campaignStep: 0, fame: 0 },
    });
    const battle = await startArenaBattle(ownerId, communityId, {
      opponentKey: "CHALLENGER_C5_S0",
    });

    expect((await abandonArenaBattle(ownerId, communityId, battle.id)).rewards.fame).toBe(-1);
    expect((await prisma.arenaGladiator.findUnique({ where: { id: profile.id } }))?.fame).toBe(-1);
  });
});
