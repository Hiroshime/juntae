import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { scoreChallengeActivity } from "@/lib/challenge-activities";
import { challengeState } from "@/lib/challenges";
import { formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import { challengeConfigurationSchema, challengePageSchema } from "@/lib/validation/challenge";
import {
  challengeActivitySchema,
  type ChallengeActivityInput,
} from "@/lib/validation/challenge-activity";
import { prepareChallengePhotos } from "@/server/challenge-photos";
import { validateActivityEligibility } from "@/server/domain/challenge-activity";
import { AppError, assertFound } from "@/server/errors";
import { challengeRankingQuery } from "@/server/services/challenge-ranking";
import {
  challengeTransaction,
  requireChallengeMembership,
} from "@/server/services/challenge-service";

async function context(
  db: Prisma.TransactionClient,
  userId: string,
  communityId: string,
  challengeId: string,
) {
  await requireChallengeMembership(db, userId, communityId);
  return assertFound(
    await db.challenge.findFirst({ where: { id: challengeId, communityId } }),
    "Desafio não encontrado.",
  );
}
export async function requireActivityParticipant(
  userId: string,
  communityId: string,
  challengeId: string,
) {
  const challenge = await context(prisma, userId, communityId, challengeId);
  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId, userId } },
  });
  if (!participant || participant.leftAt)
    throw new AppError("Entre no desafio para publicar seus treinos.", 403);
  if (challengeState(challenge) !== "ACTIVE")
    throw new AppError("O desafio não está em andamento.", 409);
  return { challenge, participant };
}

export async function createChallengeActivity(
  userId: string,
  communityId: string,
  challengeId: string,
  value: ChallengeActivityInput,
  rawPhotos: Uint8Array<ArrayBuffer>[],
) {
  const parsed = challengeActivitySchema.safeParse(value);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const input = parsed.data;
  const preliminary = await requireActivityParticipant(userId, communityId, challengeId);
  validateActivityEligibility(
    preliminary.challenge,
    challengeConfigurationSchema.parse(preliminary.challenge.configuration),
    preliminary.participant,
    input,
    rawPhotos.length,
  );
  const hash = createHash("sha256").update(JSON.stringify(input));
  for (const photo of rawPhotos) hash.update(String(photo.byteLength)).update(":").update(photo);
  const requestHash = hash.digest("hex");
  const photos = await prepareChallengePhotos(rawPhotos);
  return challengeTransaction(async (db) => {
    const challenge = await context(db, userId, communityId, challengeId);
    const configuration = challengeConfigurationSchema.parse(challenge.configuration);
    const participant = assertFound(
      await db.challengeParticipant.findUnique({
        where: { challengeId_userId: { challengeId, userId } },
      }),
      "Você não participa deste desafio.",
    );
    validateActivityEligibility(challenge, configuration, participant, input, photos.length);
    const existing = await db.challengeActivity.findUnique({
      where: {
        challengeId_userId_clientRequestId: {
          challengeId,
          userId,
          clientRequestId: input.clientRequestId,
        },
      },
      select: { id: true, requestHash: true, deletedAt: true },
    });
    if (existing) {
      if (existing.requestHash !== requestHash || existing.deletedAt)
        throw new AppError(
          "Este envio já foi utilizado. Atualize a página antes de registrar outro treino.",
          409,
        );
      return { id: existing.id };
    }
    const performedOn = parseCivilDate(input.performedOn);
    const dailyCount = await db.challengeActivity.count({
      where: { challengeId, userId, performedOn, deletedAt: null },
    });
    if (dailyCount >= configuration.activityRules.maxDailyActivities)
      throw new AppError(
        `Limite de ${configuration.activityRules.maxDailyActivities} treino(s) por dia atingido.`,
        409,
      );
    await db.challenge.update({ where: { id: challengeId }, data: { updatedAt: new Date() } });
    return db.challengeActivity.create({
      data: {
        ...input,
        notes: input.notes || null,
        performedOn,
        challengeId,
        userId,
        requestHash,
        score: scoreChallengeActivity(configuration, input),
        photos: { create: photos.map((data, sortOrder) => ({ data, sortOrder })) },
      },
      select: { id: true },
    });
  });
}

export async function deleteChallengeActivity(
  userId: string,
  communityId: string,
  challengeId: string,
  activityId: string,
) {
  return challengeTransaction(async (db) => {
    const challenge = await context(db, userId, communityId, challengeId);
    const activity = assertFound(
      await db.challengeActivity.findFirst({
        where: { id: activityId, challengeId },
        select: { userId: true, deletedAt: true, title: true },
      }),
      "Treino não encontrado.",
    );
    if (activity.userId !== userId)
      throw new AppError("Você só pode remover seus próprios treinos.", 403);
    if (challengeState(challenge) !== "ACTIVE")
      throw new AppError(
        "Não é possível remover treinos após o encerramento ou cancelamento.",
        409,
      );
    if (activity.deletedAt) return;
    await db.challenge.update({ where: { id: challengeId }, data: { updatedAt: new Date() } });
    await db.challengeActivity.update({
      where: { id: activityId },
      data: { deletedAt: new Date() },
    });
    await db.challengeActivityPhoto.deleteMany({ where: { activityId } });
    const member = await requireChallengeMembership(db, userId, communityId);
    const actorName = member.displayName || member.user.name;
    await db.challengeAuditLog.create({
      data: {
        challengeId,
        actorId: userId,
        actorName,
        action: "REMOVE",
        activityId,
        activityTitle: activity.title,
        participantName: actorName,
        reason: "Registro e fotos removidos pelo autor; a pontuação deixou de contar.",
      },
    });
  });
}

export async function getChallengePhoto(
  userId: string,
  communityId: string,
  challengeId: string,
  activityId: string,
  photoId: string,
) {
  await context(prisma, userId, communityId, challengeId);
  return assertFound(
    await prisma.challengeActivityPhoto.findFirst({
      where: { id: photoId, activityId, activity: { challengeId, deletedAt: null } },
      select: { data: true },
    }),
    "Foto não encontrada.",
  );
}

type RankingRow = {
  userId: string;
  name: string;
  score: Prisma.Decimal;
  activityCount: number;
  position: number | null;
};
export async function getChallengeActivityBoard(
  userId: string,
  communityId: string,
  challengeId: string,
  requestedFeedPage = 1,
  requestedRankPage = 1,
) {
  const feedPage = challengePageSchema.parse(requestedFeedPage);
  const rankPage = challengePageSchema.parse(requestedRankPage);
  return prisma.$transaction(
    async (db) => {
      const challenge = await context(db, userId, communityId, challengeId);
      const [activities, totalActivities, ranking] = await Promise.all([
        db.challengeActivity.findMany({
          where: { challengeId, deletedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (feedPage - 1) * 10,
          take: 11,
          select: {
            id: true,
            title: true,
            notes: true,
            activityType: true,
            performedOn: true,
            durationSeconds: true,
            distanceMeters: true,
            score: true,
            invalidatedAt: true,
            moderationReason: true,
            moderationVersion: true,
            userId: true,
            participant: {
              select: {
                leftAt: true,
                member: {
                  select: { displayName: true, user: { select: { name: true, avatarUrl: true } } },
                },
              },
            },
            photos: { orderBy: { sortOrder: "asc" }, select: { id: true } },
          },
        }),
        db.challengeActivity.count({ where: { challengeId, deletedAt: null } }),
        challenge.finalizedAt
          ? db.challengeResult.findMany({
              where: { challengeId },
              orderBy: [{ score: "desc" }, { name: "asc" }, { userId: "asc" }],
              skip: (rankPage - 1) * 20,
              take: 21,
            })
          : db.$queryRaw<RankingRow[]>`
              SELECT * FROM (${challengeRankingQuery(communityId, challengeId)}) AS ranking
              ORDER BY score DESC, name ASC, "userId" ASC LIMIT 21 OFFSET ${(rankPage - 1) * 20}
            `,
      ]);
      return {
        totalActivities,
        finalizedAt: challenge.finalizedAt?.toISOString() ?? null,
        hasNextFeed: activities.length > 10,
        hasNextRanking: ranking.length > 20,
        activities: activities.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title,
          notes: item.notes,
          activityType: item.activityType,
          performedOn: formatCivilDate(item.performedOn),
          durationSeconds: item.durationSeconds,
          distanceMeters: item.distanceMeters,
          score: Number(item.score),
          invalidated: Boolean(item.invalidatedAt),
          moderationReason: item.moderationReason,
          moderationVersion: item.moderationVersion,
          name: item.participant.member.displayName || item.participant.member.user.name,
          avatarUrl: item.participant.member.user.avatarUrl,
          left: Boolean(item.participant.leftAt),
          canDelete: item.userId === userId && challengeState(challenge) === "ACTIVE",
          photos: item.photos.map(({ id }) => ({
            id,
            url: `/api/communities/${communityId}/challenges/${challengeId}/activities/${item.id}/photos/${id}`,
          })),
        })),
        ranking: ranking.slice(0, 20).map((row) => ({
          userId: row.userId,
          name: row.name,
          score: Number(row.score),
          activityCount: Number(row.activityCount),
          position: row.position,
        })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export type ChallengeActivityBoard = Awaited<ReturnType<typeof getChallengeActivityBoard>>;
