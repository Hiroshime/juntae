import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeSchema, type ChallengeConfiguration } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import { createChallenge, changeChallengeParticipation } from "@/server/services/challenge-service";
import {
  createChallengeActivity,
  deleteChallengeActivity,
  getChallengeActivityBoard,
  getChallengePhoto,
} from "@/server/services/challenge-activity-service";

describe("treinos e ranking", () => {
  const suffix = randomUUID();
  let communityId: string;
  let owner: string;
  let author: string;
  let member: string;
  let outsider: string;
  const extraIds: string[] = [];
  let photo: Uint8Array<ArrayBuffer>;
  const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
  beforeAll(async () => {
    const users = await Promise.all(
      [
        "owner",
        "author",
        "member",
        "outsider",
        ...Array.from({ length: 20 }, (_, i) => `extra${i}`),
      ].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `workout-${suffix}-${name}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [owner, author, member, outsider] = users.slice(0, 4).map((user) => user.id);
    extraIds.push(...users.slice(4).map((user) => user.id));
    communityId = (
      await prisma.community.create({
        data: {
          name: "Treinos",
          slug: `workout-${suffix}`,
          createdById: owner,
          members: {
            create: [owner, author, member, ...extraIds].map((userId) => ({
              userId,
              role: userId === owner ? "OWNER" : "MEMBER",
            })),
          },
        },
      })
    ).id;
    photo = new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } })
        .png()
        .toBuffer(),
    );
  });
  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, author, member, outsider, ...extraIds].filter(Boolean) } },
    });
  });
  async function challenge(
    metric: ChallengeConfiguration["scoring"]["metric"] = "POINTS",
    daily = 3,
  ) {
    const input = challengeSchema.parse({
      title: "Desafio teste",
      rules: "Treinos reais e fotos do exercício.",
      startDate: today,
      endDate: addCivilDays(today, 5),
      timezone: "America/Sao_Paulo",
      configuration: {
        version: 1,
        type: "FITNESS",
        scoring: metric === "POINTS" ? { metric, pointsPerActivity: 10 } : { metric },
        activityRules: { maxDailyActivities: daily, minDurationMinutes: 10, requirePhoto: true },
      },
    });
    const { id } = await createChallenge(author, communityId, input);
    for (const user of [author, member])
      await changeChallengeParticipation(user, communityId, id, "JOIN");
    return id;
  }
  const input = () =>
    challengeActivitySchema.parse({
      clientRequestId: randomUUID(),
      title: "Caminhada",
      activityType: "WALK",
      performedOn: today,
      durationSeconds: 1800,
      distanceMeters: 3200,
    });
  const post = (id: string, actor = author, value = input()) =>
    createChallengeActivity(actor, communityId, id, value, [photo]);
  const board = (id: string, feed = 1, rank = 1) =>
    getChallengeActivityBoard(owner, communityId, id, feed, rank);
  it("persiste fotos e calcula as três métricas, com empates compartilhados", async () => {
    for (const [metric, expected] of [
      ["POINTS", 10],
      ["DURATION", 1800],
      ["DISTANCE", 3200],
    ] as const) {
      const id = await challenge(metric);
      await post(id);
      await post(id, member);
      const result = await board(id);
      expect(result.totalActivities).toBe(2);
      expect(result.ranking.map((row) => [row.position, row.score])).toEqual([
        [1, expected],
        [1, expected],
      ]);
      const activity = result.activities[0];
      const saved = await getChallengePhoto(
        owner,
        communityId,
        id,
        activity.id,
        activity.photos[0].id,
      );
      expect((await sharp(saved.data).metadata()).format).toBe("webp");
      expect(JSON.stringify(result)).not.toContain("@test.local");
    }
  });
  it("limita envios concorrentes e repetições idempotentes sem ultrapassar a cota", async () => {
    const id = await challenge("POINTS", 1);
    const value = input();
    const retries = await Promise.all([post(id, author, value), post(id, author, value)]);
    expect(retries[0].id).toBe(retries[1].id);
    expect((await board(id)).totalActivities).toBe(1);
    await expect(post(id, author, { ...value, title: "Conteúdo diferente" })).rejects.toMatchObject(
      { status: 409 },
    );
    const results = await Promise.allSettled([post(id, member), post(id, member)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await board(id)).totalActivities).toBe(2);
  });
  it("não grava treino ou fotos quando dados ou comprovação são inválidos", async () => {
    const id = await challenge();
    await expect(
      createChallengeActivity(author, communityId, id, input(), []),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createChallengeActivity(author, communityId, id, input(), [new Uint8Array([1, 2])]),
    ).rejects.toMatchObject({ status: 400 });
    await expect(post(id, author, { ...input(), durationSeconds: 599 })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      post(id, author, { ...input(), performedOn: addCivilDays(today, 1) }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await board(id)).totalActivities).toBe(0);
  });
  it("restringe publicação, leitura, fotos e remoção, inclusive para admin", async () => {
    const id = await challenge();
    const activity = await post(id);
    const savedPhoto = (await board(id)).activities[0].photos[0].id;
    await expect(post(id, owner)).rejects.toMatchObject({ status: 403 });
    await expect(post(id, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(getChallengeActivityBoard(outsider, communityId, id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      getChallengePhoto(outsider, communityId, id, activity.id, savedPhoto),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getChallengePhoto(owner, randomUUID(), id, activity.id, savedPhoto),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getChallengePhoto(owner, communityId, await challenge(), activity.id, savedPhoto),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      deleteChallengeActivity(owner, communityId, id, activity.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      deleteChallengeActivity(member, communityId, id, activity.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("retira pontuação e fotos ao remover e libera a cota diária", async () => {
    const id = await challenge("POINTS", 1);
    const value = input();
    const activity = await post(id, author, value);
    const savedPhoto = (await board(id)).activities[0].photos[0].id;
    await deleteChallengeActivity(author, communityId, id, activity.id);
    expect((await board(id)).ranking.every((row) => row.score === 0 && row.position === null)).toBe(
      true,
    );
    expect(await prisma.challengeActivityPhoto.count({ where: { activityId: activity.id } })).toBe(
      0,
    );
    await expect(
      getChallengePhoto(author, communityId, id, activity.id, savedPhoto),
    ).rejects.toMatchObject({ status: 404 });
    await expect(post(id, author, value)).rejects.toMatchObject({ status: 409 });
    await post(id);
    expect((await board(id)).totalActivities).toBe(1);
  });
  it("preserva feed ao sair, restaura ranking ao voltar e remove dados com a membership", async () => {
    const id = await challenge();
    const activity = await post(id, member);
    await changeChallengeParticipation(member, communityId, id, "LEAVE");
    expect((await board(id)).ranking.some((person) => person.userId === member)).toBe(false);
    expect((await board(id)).activities[0].left).toBe(true);
    await expect(post(id, member)).rejects.toMatchObject({ status: 403 });
    await changeChallengeParticipation(member, communityId, id, "JOIN");
    expect((await board(id)).ranking.find((person) => person.userId === member)?.score).toBe(10);
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: member } },
    });
    try {
      expect(await prisma.challengeActivity.findUnique({ where: { id: activity.id } })).toBeNull();
      expect((await board(id)).totalActivities).toBe(0);
    } finally {
      await prisma.communityMember.create({ data: { communityId, userId: member } });
    }
  });
  it("encerramento e cancelamento bloqueiam mutações mas preservam consulta", async () => {
    for (const cancel of [true, false]) {
      const id = await challenge();
      const activity = await post(id);
      if (cancel) await changeChallengeParticipation(owner, communityId, id, "CANCEL");
      else
        await prisma.challenge.update({
          where: { id },
          data: {
            startDate: new Date(addCivilDays(today, -2)),
            endDate: new Date(addCivilDays(today, -1)),
          },
        });
      await expect(post(id)).rejects.toMatchObject({ status: 409 });
      await expect(
        deleteChallengeActivity(author, communityId, id, activity.id),
      ).rejects.toMatchObject({ status: 409 });
      expect((await board(id)).totalActivities).toBe(1);
    }
  });
  it("pagina feed e ranking sem limitar o cálculo à página", async () => {
    const id = await challenge("POINTS", 10);
    for (let i = 0; i < 6; i++) {
      await post(id);
      await post(id, member);
    }
    await prisma.challengeParticipant.createMany({
      data: extraIds.map((userId) => ({ communityId, challengeId: id, userId })),
    });
    const first = await board(id);
    const second = await board(id, 2, 2);
    expect(first.activities).toHaveLength(10);
    expect(second.activities).toHaveLength(2);
    expect(first.ranking).toHaveLength(20);
    expect(second.ranking).toHaveLength(2);
    expect(first.hasNextFeed).toBe(true);
    expect(first.hasNextRanking).toBe(true);
    expect(first.ranking.slice(0, 2).map((row) => [row.score, row.position])).toEqual([
      [60, 1],
      [60, 1],
    ]);
    expect(new Set([...first.activities, ...second.activities].map((row) => row.id)).size).toBe(12);
  });
});
