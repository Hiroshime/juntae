import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeSchema } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import {
  createChallenge,
  changeChallengeParticipation,
  updateChallenge,
} from "@/server/services/challenge-service";
import {
  createChallengeActivity,
  getChallengeActivityBoard,
} from "@/server/services/challenge-activity-service";

it("persiste modalidades e pontos, recusa desabilitadas, bloqueia edição e compartilha cota diária", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { name: "Atleta", email: `modalities-${suffix}@test.local`, passwordHash: "unused" },
  });
  let communityId: string | undefined;
  try {
    communityId = (
      await prisma.community.create({
        data: {
          name: "Esportes",
          slug: `sports-${suffix}`,
          createdById: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      })
    ).id;
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    const input = challengeSchema.parse({
      title: "Esportes da turma",
      rules: "Somente as modalidades selecionadas.",
      startDate: today,
      endDate: today,
      timezone: "America/Sao_Paulo",
      configuration: {
        version: 1,
        type: "FITNESS",
        scoring: { metric: "POINTS", pointsPerActivity: 10 },
        activityRules: { requirePhoto: false, maxDailyActivities: 2, minDurationMinutes: 10 },
        modalities: [
          { id: "RUN", label: "Corrida", points: 20 },
          { id: "CUSTOM_1234567890abcdef12345678", label: "Beach tennis", points: 15 },
        ],
      },
    });
    const { id } = await createChallenge(user.id, communityId, input);
    await changeChallengeParticipation(user.id, communityId, id, "JOIN");
    const post = (activityType: string) =>
      createChallengeActivity(
        user.id,
        communityId!,
        id,
        challengeActivitySchema.parse({
          clientRequestId: randomUUID(),
          title: "Treino da turma",
          activityType,
          performedOn: today,
          durationSeconds: 1800,
        }),
        [],
      );
    for (const type of ["WALK", "PILATES", "OTHER", "CUSTOM_aaaaaaaaaaaaaaaaaaaaaaaa"])
      await expect(post(type)).rejects.toMatchObject({ status: 400 });
    await post("RUN");
    await post("CUSTOM_1234567890abcdef12345678");
    const board = await getChallengeActivityBoard(user.id, communityId, id);
    expect(board.ranking[0]).toMatchObject({ score: 35, activityCount: 2 });
    expect(board.activities.map((row) => row.score).sort()).toEqual([15, 20]);
    await expect(post("RUN")).rejects.toMatchObject({ status: 409 });
    const changed = {
      ...input,
      configuration: {
        ...input.configuration,
        modalities: [{ id: "RUN", label: "Corrida", points: 999 }],
      },
    };
    await expect(updateChallenge(user.id, communityId, id, changed)).rejects.toMatchObject({
      status: 409,
    });
    const tomorrow = addCivilDays(today, 1);
    const future = { ...input, startDate: tomorrow, endDate: tomorrow };
    const scheduled = await createChallenge(user.id, communityId, future);
    await updateChallenge(user.id, communityId, scheduled.id, {
      ...changed,
      startDate: tomorrow,
      endDate: tomorrow,
    });
    await changeChallengeParticipation(user.id, communityId, scheduled.id, "JOIN");
    await expect(updateChallenge(user.id, communityId, scheduled.id, future)).rejects.toMatchObject(
      { status: 409 },
    );
  } finally {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

it("calcula pontos por tempo/distância no servidor e exige distância quando a regra usa km", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { name: "Atleta métrico", email: `metric-${suffix}@test.local`, passwordHash: "unused" },
  });
  let communityId: string | undefined;
  try {
    communityId = (
      await prisma.community.create({
        data: {
          name: "Métricas",
          slug: `metric-${suffix}`,
          createdById: user.id,
          members: { create: { userId: user.id, role: "OWNER" } },
        },
      })
    ).id;
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    const input = challengeSchema.parse({
      title: "Pontos precisos",
      rules: "Cada modalidade possui sua própria métrica.",
      startDate: today,
      endDate: today,
      timezone: "America/Sao_Paulo",
      configuration: {
        version: 1,
        type: "FITNESS",
        scoring: { metric: "POINTS", pointsPerActivity: 10 },
        activityRules: { requirePhoto: false, maxDailyActivities: 3, minDurationMinutes: 1 },
        modalities: [
          {
            id: "RUN",
            label: "Corrida",
            points: 5,
            pointsPerMetric: { metric: "DURATION", unitValue: 180 },
          },
          {
            id: "BIKE",
            label: "Ciclismo",
            points: 3,
            pointsPerMetric: { metric: "DISTANCE", unitValue: 1000 },
          },
        ],
      },
    });
    const { id } = await createChallenge(user.id, communityId, input);
    await changeChallengeParticipation(user.id, communityId, id, "JOIN");
    const post = (activityType: "RUN" | "BIKE", distanceMeters: number | null) =>
      createChallengeActivity(
        user.id,
        communityId!,
        id,
        challengeActivitySchema.parse({
          clientRequestId: randomUUID(),
          title: "Treino métrico",
          activityType,
          performedOn: today,
          durationSeconds: 601,
          distanceMeters,
        }),
        [],
      );
    await post("RUN", null);
    await post("BIKE", 3200);
    await expect(post("BIKE", null)).rejects.toMatchObject({ status: 400 });
    const board = await getChallengeActivityBoard(user.id, communityId, id);
    expect(board.activities.map((row) => row.score).sort((a, b) => a - b)).toEqual([9.6, 16.7]);
    expect(board.ranking[0]).toMatchObject({ score: 26.3, activityCount: 2 });
  } finally {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
