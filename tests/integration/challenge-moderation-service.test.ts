import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeSchema, type ChallengeConfiguration } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import {
  changeChallengeParticipation,
  createChallenge,
  getChallenge,
} from "@/server/services/challenge-service";
import {
  createChallengeActivity,
  deleteChallengeActivity,
  getChallengeActivityBoard,
  getChallengePhoto,
} from "@/server/services/challenge-activity-service";
import {
  finalizeChallenge,
  getChallengeAudit,
  moderateChallengeActivity,
} from "@/server/services/challenge-moderation-service";

describe("moderação e consolidação de desafios", () => {
  const suffix = randomUUID();
  const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
  const userIds: string[] = [];
  let communityId: string;
  let owner: string, creator: string, athlete: string, outsider: string, admin: string;
  beforeAll(async () => {
    for (const name of ["Owner", "Criador", "Atleta", "Externo", "Admin"])
      userIds.push(
        (
          await prisma.user.create({
            data: { name, email: `${suffix}-${name}@test.local`, passwordHash: "unused" },
          })
        ).id,
      );
    [owner, creator, athlete, outsider, admin] = userIds;
    communityId = (
      await prisma.community.create({
        data: {
          name: "Moderação",
          slug: `moderation-${suffix}`,
          createdById: owner,
          members: {
            create: [owner, creator, athlete, admin].map((userId) => ({
              userId,
              role: userId === owner ? "OWNER" : userId === admin ? "ADMIN" : "MEMBER",
            })),
          },
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });
  async function fixture(metric: ChallengeConfiguration["scoring"]["metric"] = "POINTS") {
    const { id } = await createChallenge(
      creator,
      communityId,
      challengeSchema.parse({
        title: "Desafio da revisão",
        rules: "Somente treinos que cumpram o combinado.",
        startDate: today,
        endDate: today,
        timezone: "America/Sao_Paulo",
        configuration: {
          version: 1,
          type: "FITNESS",
          scoring: metric === "POINTS" ? { metric, pointsPerActivity: 10 } : { metric },
          activityRules: { requirePhoto: false, minDurationMinutes: 10, maxDailyActivities: 1 },
        },
      }),
    );
    await changeChallengeParticipation(athlete, communityId, id, "JOIN");
    return id;
  }
  const post = (id: string, actor = athlete) =>
    createChallengeActivity(
      actor,
      communityId,
      id,
      challengeActivitySchema.parse({
        clientRequestId: randomUUID(),
        title: "Corrida da manhã",
        activityType: "RUN",
        performedOn: today,
        durationSeconds: 1800,
        distanceMeters: 3500,
      }),
      [],
    );
  const moderate = (
    id: string,
    activityId: string,
    expectedVersion = 0,
    restore = false,
    actor = owner,
  ) =>
    moderateChallengeActivity(actor, communityId, id, activityId, {
      action: restore ? "RESTORE" : "INVALIDATE",
      reason: restore ? "Comprovante revisado e aceito." : "Não cumpriu as regras combinadas.",
      expectedVersion,
    });
  const board = (id: string, page = 1) =>
    getChallengeActivityBoard(owner, communityId, id, 1, page);
  const end = (id: string) =>
    prisma.challenge.update({
      where: { id },
      data: {
        startDate: new Date(addCivilDays(today, -2)),
        endDate: new Date(addCivilDays(today, -1)),
      },
    });

  it("desconsidera e restabelece nas três métricas, preserva feed e não libera cota", async () => {
    for (const [metric, score] of [
      ["POINTS", 10],
      ["DURATION", 1800],
      ["DISTANCE", 3500],
    ] as const) {
      const id = await fixture(metric);
      const activity = await post(id);
      await moderate(id, activity.id);
      const invalid = await board(id);
      expect(invalid.activities[0]).toMatchObject({
        invalidated: true,
        score,
        moderationVersion: 1,
      });
      expect(invalid.ranking[0]).toMatchObject({ score: 0, activityCount: 0, position: null });
      expect(invalid.totalActivities).toBe(1);
      await expect(post(id)).rejects.toMatchObject({ status: 409 });
      await moderate(id, activity.id, 1, true, creator);
      expect((await board(id)).ranking[0]).toMatchObject({ score, activityCount: 1, position: 1 });
      const audit = await getChallengeAudit(athlete, communityId, id);
      expect(audit.items.map((entry) => entry.action)).toEqual(["RESTORE", "INVALIDATE"]);
      expect(JSON.stringify(audit)).not.toContain("@test.local");
    }
  });
  it("exige motivo e permissão no servidor, incluindo isolamento de comunidade/atividade", async () => {
    const id = await fixture();
    const activity = await post(id);
    await expect(moderate(id, activity.id, 0, false, athlete)).rejects.toMatchObject({
      status: 403,
    });
    await expect(moderate(id, activity.id, 0, false, outsider)).rejects.toMatchObject({
      status: 404,
    });
    await expect(moderate(await fixture(), activity.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      moderateChallengeActivity(owner, randomUUID(), id, activity.id, {
        action: "INVALIDATE",
        reason: "Motivo da revisão.",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      moderateChallengeActivity(owner, communityId, id, activity.id, {
        action: "INVALIDATE",
        reason: " ",
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(getChallengeAudit(outsider, communityId, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(finalizeChallenge(athlete, communityId, id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(finalizeChallenge(outsider, communityId, id)).rejects.toMatchObject({
      status: 404,
    });
    await moderate(id, activity.id, 0, false, admin);
  });
  it("recusa decisões concorrentes/desatualizadas e mantém auditoria atômica", async () => {
    const id = await fixture();
    const activity = await post(id);
    const results = await Promise.allSettled([
      moderate(id, activity.id),
      moderate(id, activity.id, 0, false, creator),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getChallengeAudit(owner, communityId, id)).items).toHaveLength(1);
    await expect(moderate(id, activity.id, 0, true)).rejects.toMatchObject({ status: 409 });
    await expect(moderate(id, activity.id, 1)).rejects.toMatchObject({ status: 409 });
    await moderate(id, activity.id, 1, true);
  });
  it("remoção pelo autor apaga fotos, registra histórico e não permite restaurar o removido", async () => {
    const id = await fixture();
    const activity = await post(id);
    await moderate(id, activity.id);
    await deleteChallengeActivity(athlete, communityId, id, activity.id);
    await deleteChallengeActivity(athlete, communityId, id, activity.id);
    expect(
      (await getChallengeAudit(owner, communityId, id)).items.map((entry) => entry.action),
    ).toEqual(["REMOVE", "INVALIDATE"]);
    await expect(moderate(id, activity.id, 1, true)).rejects.toMatchObject({ status: 404 });
    await post(id);
    expect((await board(id)).ranking[0].score).toBe(10);
  });
  it("consolida só após o período; permite revisar antes e bloqueia depois", async () => {
    const id = await fixture();
    const activity = await post(id);
    await expect(finalizeChallenge(owner, communityId, id)).rejects.toMatchObject({ status: 409 });
    await end(id);
    expect((await getChallenge(owner, communityId, id)).canFinalize).toBe(true);
    await moderate(id, activity.id);
    await moderate(id, activity.id, 1, true);
    await Promise.all([
      finalizeChallenge(owner, communityId, id),
      finalizeChallenge(creator, communityId, id),
    ]);
    expect((await board(id)).finalizedAt).toBeTruthy();
    expect((await board(id)).ranking[0]).toMatchObject({ score: 10, position: 1 });
    expect(
      (await getChallengeAudit(owner, communityId, id)).items.filter(
        (row) => row.action === "FINALIZE",
      ),
    ).toHaveLength(1);
    await expect(moderate(id, activity.id, 2)).rejects.toMatchObject({ status: 409 });
    await expect(
      deleteChallengeActivity(athlete, communityId, id, activity.id),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getChallenge(owner, communityId, id)).canModerate).toBe(false);
  });
  it("serializa consolidação com revisão: snapshot não contradiz a decisão persistida", async () => {
    const id = await fixture();
    const activity = await post(id);
    await end(id);
    await Promise.allSettled([
      moderate(id, activity.id),
      finalizeChallenge(owner, communityId, id),
    ]);
    await finalizeChallenge(owner, communityId, id);
    const final = await board(id);
    expect(final.ranking[0].score).toBe(final.activities[0].invalidated ? 0 : 10);
  });
  it("preserva empates, página completa, nomes e classificação após remover membership", async () => {
    const id = await fixture();
    await post(id);
    await changeChallengeParticipation(creator, communityId, id, "JOIN");
    await post(id, creator);
    const extras: string[] = [];
    for (let i = 0; i < 20; i++) {
      const user = await prisma.user.create({
        data: {
          name: `Extra ${i}`,
          email: `${suffix}-extra-${i}@test.local`,
          passwordHash: "unused",
        },
      });
      userIds.push(user.id);
      extras.push(user.id);
    }
    await prisma.communityMember.createMany({
      data: extras.map((userId) => ({ communityId, userId })),
    });
    await prisma.challengeParticipant.createMany({
      data: extras.map((userId) => ({ challengeId: id, communityId, userId })),
    });
    await end(id);
    await finalizeChallenge(owner, communityId, id);
    const before = await board(id);
    expect(before.ranking).toHaveLength(20);
    expect(before.ranking.slice(0, 2).map((row) => row.position)).toEqual([1, 1]);
    expect((await board(id, 2)).ranking).toHaveLength(2);
    expect((await board(id, 2)).ranking.every((row) => row.position === null)).toBe(true);
    await prisma.user.update({ where: { id: athlete }, data: { name: "Nome alterado" } });
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: athlete } },
    });
    try {
      expect((await board(id)).ranking).toEqual(before.ranking);
      await expect(getChallengeActivityBoard(athlete, communityId, id)).rejects.toMatchObject({
        status: 404,
      });
    } finally {
      await prisma.communityMember.create({ data: { communityId, userId: athlete } });
      await prisma.user.update({ where: { id: athlete }, data: { name: "Atleta" } });
    }
  });
  it("preserva auditoria após remoção da membership e pagina revisões", async () => {
    const id = await fixture();
    const activity = await post(id);
    for (let version = 0; version < 22; version++)
      await moderate(id, activity.id, version, version % 2 === 1);
    const first = await getChallengeAudit(owner, communityId, id);
    const second = await getChallengeAudit(owner, communityId, id, 2);
    expect(first.hasNext).toBe(true);
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(22);
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: athlete } },
    });
    try {
      expect((await getChallengeAudit(owner, communityId, id)).items).toEqual(first.items);
    } finally {
      await prisma.communityMember.create({ data: { communityId, userId: athlete } });
    }
  });
  it("sem treinos não inventa vencedor; cancelados/agendados não consolidam nem moderam", async () => {
    const empty = await fixture();
    await end(empty);
    await finalizeChallenge(owner, communityId, empty);
    expect((await board(empty)).ranking[0]).toMatchObject({ score: 0, position: null });
    for (const cancelled of [true, false]) {
      const id = await fixture();
      const activity = await post(id);
      if (cancelled) await changeChallengeParticipation(owner, communityId, id, "CANCEL");
      else
        await prisma.challenge.update({
          where: { id },
          data: {
            startDate: new Date(addCivilDays(today, 1)),
            endDate: new Date(addCivilDays(today, 2)),
          },
        });
      await expect(moderate(id, activity.id)).rejects.toMatchObject({ status: 409 });
      await expect(finalizeChallenge(owner, communityId, id)).rejects.toMatchObject({
        status: 409,
      });
    }
  });
  it("moderação mantém fotos privadas e remoção do autor elimina seus bytes", async () => {
    const id = await fixture();
    const raw = new Uint8Array(
      await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
        .png()
        .toBuffer(),
    );
    const activity = await createChallengeActivity(
      athlete,
      communityId,
      id,
      challengeActivitySchema.parse({
        clientRequestId: randomUUID(),
        title: "Treino fotografado",
        activityType: "RUN",
        performedOn: today,
        durationSeconds: 1800,
      }),
      [raw],
    );
    const photoId = (await board(id)).activities[0].photos[0].id;
    await moderate(id, activity.id);
    expect(
      (await getChallengePhoto(athlete, communityId, id, activity.id, photoId)).data.length,
    ).toBeGreaterThan(0);
    await expect(
      getChallengePhoto(outsider, communityId, id, activity.id, photoId),
    ).rejects.toMatchObject({ status: 404 });
    await deleteChallengeActivity(athlete, communityId, id, activity.id);
    expect(await prisma.challengeActivityPhoto.count({ where: { activityId: activity.id } })).toBe(
      0,
    );
    await expect(
      getChallengePhoto(owner, communityId, id, activity.id, photoId),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("resultado definitivo mantém posições 1, 1, 3 e aceita desafio sem inscritos", async () => {
    const id = await fixture("DISTANCE");
    await changeChallengeParticipation(creator, communityId, id, "JOIN");
    await changeChallengeParticipation(admin, communityId, id, "JOIN");
    await post(id);
    await post(id, creator);
    await createChallengeActivity(
      admin,
      communityId,
      id,
      challengeActivitySchema.parse({
        clientRequestId: randomUUID(),
        title: "Caminhada curta",
        activityType: "WALK",
        performedOn: today,
        durationSeconds: 1200,
        distanceMeters: 1000,
      }),
      [],
    );
    await end(id);
    await finalizeChallenge(owner, communityId, id);
    expect((await board(id)).ranking.map((row) => [row.position, row.score])).toEqual([
      [1, 3500],
      [1, 3500],
      [3, 1000],
    ]);
    const empty = await fixture();
    await changeChallengeParticipation(athlete, communityId, empty, "LEAVE");
    await end(empty);
    await finalizeChallenge(owner, communityId, empty);
    expect((await board(empty)).ranking).toEqual([]);
    expect((await board(empty)).finalizedAt).toBeTruthy();
  });
});
