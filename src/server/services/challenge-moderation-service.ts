import { prisma } from "@/lib/db/prisma";
import { challengeState } from "@/lib/challenges";
import { challengePageSchema } from "@/lib/validation/challenge";
import {
  challengeModerationSchema,
  type ChallengeModerationInput,
} from "@/lib/validation/challenge-moderation";
import { AppError, assertFound } from "@/server/errors";
import {
  canManageChallenge,
  challengeTransaction,
  requireChallengeMembership,
} from "@/server/services/challenge-service";
import { challengeRankingQuery } from "@/server/services/challenge-ranking";

export async function moderateChallengeActivity(
  userId: string,
  communityId: string,
  challengeId: string,
  activityId: string,
  value: ChallengeModerationInput,
) {
  const parsed = challengeModerationSchema.safeParse(value);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const input = parsed.data;
  return challengeTransaction(async (db) => {
    const member = await requireChallengeMembership(db, userId, communityId);
    const challenge = assertFound(
      await db.challenge.findFirst({ where: { id: challengeId, communityId } }),
      "Desafio não encontrado.",
    );
    if (!canManageChallenge(userId, member.role, challenge.createdById))
      throw new AppError("Só o criador e administradores podem moderar treinos.", 403);
    const state = challengeState(challenge);
    if (challenge.finalizedAt || (state !== "ACTIVE" && state !== "ENDED"))
      throw new AppError(
        "Este desafio não aceita moderação. Resultados consolidados são definitivos.",
        409,
      );
    const activity = assertFound(
      await db.challengeActivity.findFirst({
        where: { id: activityId, challengeId, deletedAt: null },
        include: {
          participant: { include: { member: { include: { user: { select: { name: true } } } } } },
        },
      }),
      "Treino não encontrado.",
    );
    if (activity.moderationVersion !== input.expectedVersion)
      throw new AppError("Este treino mudou. Atualize a página antes de moderar novamente.", 409);
    if ((input.action === "INVALIDATE") === Boolean(activity.invalidatedAt))
      throw new AppError("O treino já está nesta situação. Atualize a página.", 409);
    const now = new Date();
    await db.challenge.update({ where: { id: challengeId }, data: { updatedAt: now } });
    await db.challengeActivity.update({
      where: { id: activityId },
      data: {
        invalidatedAt: input.action === "INVALIDATE" ? now : null,
        moderationReason: input.action === "INVALIDATE" ? input.reason : null,
        moderationVersion: { increment: 1 },
      },
    });
    await db.challengeAuditLog.create({
      data: {
        challengeId,
        actorId: userId,
        actorName: member.displayName || member.user.name,
        action: input.action,
        reason: input.reason,
        activityId,
        activityTitle: activity.title,
        participantName:
          activity.participant.member.displayName || activity.participant.member.user.name,
      },
    });
    return { id: activityId };
  });
}

export async function finalizeChallenge(userId: string, communityId: string, challengeId: string) {
  return challengeTransaction(async (db) => {
    const member = await requireChallengeMembership(db, userId, communityId);
    const challenge = assertFound(
      await db.challenge.findFirst({ where: { id: challengeId, communityId } }),
      "Desafio não encontrado.",
    );
    if (!canManageChallenge(userId, member.role, challenge.createdById))
      throw new AppError("Só o criador e administradores podem consolidar o resultado.", 403);
    if (challenge.finalizedAt) return { id: challengeId };
    if (challengeState(challenge) !== "ENDED")
      throw new AppError(
        "Aguarde o fim do último dia do desafio para consolidar. Desafios cancelados não têm resultado final.",
        409,
      );
    const actorName = member.displayName || member.user.name;
    await db.challenge.update({
      where: { id: challengeId },
      data: { finalizedAt: new Date(), finalizedByName: actorName },
    });
    await db.$executeRaw`
      INSERT INTO "ChallengeResult" ("challengeId", "userId", name, score, "activityCount", position)
      SELECT ${challengeId}::uuid, "userId", name, score, "activityCount", position
      FROM (${challengeRankingQuery(communityId, challengeId)}) AS ranking
    `;
    await db.challengeAuditLog.create({
      data: {
        challengeId,
        actorId: userId,
        actorName,
        action: "FINALIZE",
        reason: "Classificação final preservada após revisão. Não aceita novas alterações.",
      },
    });
    return { id: challengeId };
  });
}

export async function getChallengeAudit(
  userId: string,
  communityId: string,
  challengeId: string,
  requestedPage = 1,
) {
  await requireChallengeMembership(prisma, userId, communityId);
  assertFound(
    await prisma.challenge.findFirst({
      where: { id: challengeId, communityId },
      select: { id: true },
    }),
    "Desafio não encontrado.",
  );
  const page = challengePageSchema.parse(requestedPage);
  const rows = await prisma.challengeAuditLog.findMany({
    where: { challengeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 21,
    select: {
      id: true,
      action: true,
      actorName: true,
      activityTitle: true,
      participantName: true,
      reason: true,
      createdAt: true,
    },
  });
  return {
    items: rows.slice(0, 20).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    hasNext: rows.length > 20,
  };
}
