import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  normalizeStopText,
  stopAnswerResult,
  stopInvalidVoteThreshold,
  stopReviewSeconds,
} from "@/lib/games/stop-game";
import { stopGameActionSchema, stopRulesSchema, type StopGameAction } from "@/lib/validation/games";
import { AppError, assertFound } from "@/server/errors";

type StopRoomPlayer = {
  userId: string;
  seat: number;
  ready: boolean;
  member: { displayName: string | null; user: { name: string } };
};

type StopRoomForStart = {
  id: string;
  communityId: string;
  rules: Prisma.JsonValue;
  players: StopRoomPlayer[];
};

const stopSessionInclude = {
  players: { orderBy: { seat: "asc" } },
  categories: { orderBy: { sortOrder: "asc" } },
  rounds: {
    orderBy: { roundNumber: "desc" },
    take: 1,
    include: {
      answers: { include: { invalidVotes: true } },
    },
  },
} satisfies Prisma.StopSessionInclude;

type ActiveStopSession = Prisma.StopSessionGetPayload<{ include: typeof stopSessionInclude }>;

function displayName(player: StopRoomPlayer) {
  return player.member.displayName || player.member.user.name;
}

async function transaction<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
        throw error;
      if (attempt === 2)
        throw new AppError(
          "A rodada mudou enquanto você respondia. Atualize e tente novamente.",
          409,
          "CONFLICT",
        );
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function deadlines(answerSeconds: number, now: Date) {
  const answerDeadline = new Date(now.getTime() + answerSeconds * 1_000);
  return {
    answerDeadline,
    bonusDeadline: new Date(answerDeadline.getTime() + 10_000),
  };
}

function reviewSeconds(
  session: ActiveStopSession,
  round: ReturnType<typeof currentRound>,
  categoryIndex: number,
) {
  const category = session.categories[categoryIndex];
  return stopReviewSeconds(
    Boolean(category && round.answers.some((answer) => answer.categoryId === category.id)),
  );
}

function reviewDeadline(
  now: Date,
  session: ActiveStopSession,
  round: ReturnType<typeof currentRound>,
  categoryIndex: number,
) {
  return new Date(now.getTime() + reviewSeconds(session, round, categoryIndex) * 1_000);
}

function chooseLetter(letters: string[], previous?: string) {
  const candidates = letters.length > 1 ? letters.filter((letter) => letter !== previous) : letters;
  return candidates[randomInt(candidates.length)];
}

export async function startStopSession(db: Prisma.TransactionClient, room: StopRoomForStart) {
  const rules = stopRulesSchema.parse(room.rules);
  if (
    room.players.length < 2 ||
    room.players.length > rules.maxPlayers ||
    room.players.some((player) => !player.ready)
  )
    return;
  const now = new Date();
  const timing = deadlines(rules.answerSeconds, now);
  const ordered = [...room.players].sort((left, right) => left.seat - right.seat);
  await db.stopSession.create({
    data: {
      roomId: room.id,
      communityId: room.communityId,
      totalRounds: rules.roundCount,
      answerSeconds: rules.answerSeconds,
      players: {
        create: ordered.map((player) => ({
          userId: player.userId,
          name: displayName(player),
          seat: player.seat,
        })),
      },
      categories: {
        create: rules.categories.map((name, sortOrder) => ({ name, sortOrder })),
      },
      rounds: {
        create: {
          roundNumber: 1,
          letter: chooseLetter(rules.letters),
          startedAt: now,
          ...timing,
        },
      },
    },
  });
  await db.gameRoom.update({
    where: { id: room.id },
    data: { status: "PLAYING", roundNumber: { increment: 1 }, version: { increment: 1 } },
  });
}

export async function cancelStopSession(
  db: Prisma.TransactionClient,
  roomId: string,
  reason: string,
) {
  const session = await db.stopSession.findFirst({ where: { roomId, status: "ACTIVE" } });
  if (!session) return;
  await db.stopSession.update({
    where: { id: session.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason },
  });
  await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
  await db.gameRoom.update({
    where: { id: roomId },
    data: { status: "WAITING", version: { increment: 1 } },
  });
}

export async function syncStopRoomTimer(roomId: string, communityId: string, now = new Date()) {
  const expiredRound = await prisma.stopRound.findFirst({
    where: {
      session: { roomId, communityId, status: "ACTIVE" },
      OR: [
        { status: "ANSWERING", bonusDeadline: { lte: now } },
        { status: "REVIEWING", reviewDeadline: { lte: now } },
      ],
    },
    select: { id: true },
  });
  if (!expiredRound) return;

  await transaction(async (db) => {
    const room = assertFound(
      await db.gameRoom.findFirst({
        where: { id: roomId, communityId, gameType: "STOP", status: "PLAYING" },
        select: { id: true, rules: true },
      }),
      "Sala de Stop não encontrada.",
    );
    const session = await activeSession(db, roomId);
    const round = currentRound(session);
    if (round.id !== expiredRound.id) return;
    if (round.status === "ANSWERING" && round.bonusDeadline <= now) {
      await db.stopRound.update({
        where: { id: round.id },
        data: {
          status: "REVIEWING",
          reviewStartedAt: now,
          reviewDeadline: reviewDeadline(now, session, round, 0),
          reviewCategoryIndex: 0,
        },
      });
    } else if (
      round.status === "REVIEWING" &&
      round.reviewDeadline &&
      round.reviewDeadline <= now
    ) {
      await finishReviewCategory(
        db,
        session,
        round,
        stopRulesSchema.parse(room.rules),
        roomId,
        now,
      );
    } else return;
    await db.gameRoom.update({
      where: { id: roomId },
      data: { version: { increment: 1 } },
    });
  });
}

async function activeSession(db: Prisma.TransactionClient, roomId: string) {
  return assertFound(
    await db.stopSession.findFirst({
      where: { roomId, status: "ACTIVE" },
      include: stopSessionInclude,
    }),
    "Não há uma partida de Stop em andamento.",
  );
}

function currentRound(session: ActiveStopSession) {
  return assertFound(
    session.rounds.find((round) => round.roundNumber === session.currentRoundNumber),
    "Rodada não encontrada.",
  );
}

async function expireRoundIfNeeded(
  db: Prisma.TransactionClient,
  session: ActiveStopSession,
  round: ReturnType<typeof currentRound>,
  now: Date,
) {
  if (round.status !== "ANSWERING" || round.bonusDeadline > now) return false;
  await db.stopRound.update({
    where: { id: round.id },
    data: {
      status: "REVIEWING",
      reviewStartedAt: now,
      reviewDeadline: reviewDeadline(now, session, round, 0),
      reviewCategoryIndex: 0,
    },
  });
  return true;
}

async function saveAnswers(
  db: Prisma.TransactionClient,
  userId: string,
  session: ActiveStopSession,
  round: ReturnType<typeof currentRound>,
  answers: Extract<StopGameAction, { action: "SAVE_ANSWERS" }>["answers"],
) {
  if (round.status !== "ANSWERING") throw new AppError("A rodada não aceita mais respostas.", 409);
  const player = assertFound(
    session.players.find((candidate) => candidate.userId === userId),
    "Você não participa desta partida.",
  );
  const categories = new Set(session.categories.map((category) => category.id));
  if (new Set(answers.map((answer) => answer.categoryId)).size !== answers.length)
    throw new AppError("Não repita categorias no envio.");
  if (answers.some((answer) => !categories.has(answer.categoryId)))
    throw new AppError("Categoria inválida.");
  for (const answer of answers) {
    const value = answer.value.replace(/\s+/g, " ").trim();
    if (!value) {
      await db.stopAnswer.deleteMany({
        where: { roundId: round.id, categoryId: answer.categoryId, userId },
      });
      continue;
    }
    await db.stopAnswer.upsert({
      where: {
        roundId_categoryId_userId: { roundId: round.id, categoryId: answer.categoryId, userId },
      },
      create: {
        roundId: round.id,
        categoryId: answer.categoryId,
        userId,
        userName: player.name,
        value,
        normalizedValue: normalizeStopText(value),
      },
      update: { value, normalizedValue: normalizeStopText(value) },
    });
  }
}

async function finishReviewCategory(
  db: Prisma.TransactionClient,
  session: ActiveStopSession,
  round: ReturnType<typeof currentRound>,
  rules: ReturnType<typeof stopRulesSchema.parse>,
  roomId: string,
  now: Date,
) {
  const category = assertFound(
    session.categories[round.reviewCategoryIndex],
    "Categoria de revisão inválida.",
  );
  const answers = round.answers.filter((answer) => answer.categoryId === category.id);
  for (const answer of answers) {
    const result = stopAnswerResult({
      value: answer.value,
      letter: round.letter,
      invalidVotes: answer.invalidVotes.length,
      playerCount: session.players.length,
    });
    await db.stopAnswer.update({
      where: { id: answer.id },
      data: { finalValid: result.valid, awardedPoints: result.points },
    });
    if (result.points)
      await db.stopSessionPlayer.update({
        where: { sessionId_userId: { sessionId: session.id, userId: answer.userId } },
        data: { score: { increment: result.points } },
      });
  }

  if (round.reviewCategoryIndex + 1 < session.categories.length) {
    await db.stopRound.update({
      where: { id: round.id },
      data: {
        reviewCategoryIndex: { increment: 1 },
        reviewDeadline: reviewDeadline(now, session, round, round.reviewCategoryIndex + 1),
      },
    });
    return;
  }

  await db.stopRound.update({
    where: { id: round.id },
    data: { status: "FINISHED", reviewDeadline: null, finishedAt: now },
  });
  if (round.roundNumber >= session.totalRounds) {
    await db.stopSession.update({
      where: { id: session.id },
      data: { status: "FINISHED", finishedAt: now },
    });
    await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
    await db.gameRoom.update({ where: { id: roomId }, data: { status: "WAITING" } });
    return;
  }

  const nextRound = round.roundNumber + 1;
  await db.stopRound.create({
    data: {
      sessionId: session.id,
      roundNumber: nextRound,
      letter: chooseLetter(rules.letters, round.letter),
      startedAt: now,
      ...deadlines(session.answerSeconds, now),
    },
  });
  await db.stopSession.update({
    where: { id: session.id },
    data: { currentRoundNumber: nextRound },
  });
}

export async function changeStopGame(
  userId: string,
  communityId: string,
  roomId: string,
  rawAction: StopGameAction,
) {
  const parsed = stopGameActionSchema.safeParse(rawAction);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const action = parsed.data;
  await transaction(async (db) => {
    await membership(db, userId, communityId);
    const room = assertFound(
      await db.gameRoom.findFirst({
        where: { id: roomId, communityId, gameType: "STOP" },
        select: { id: true, rules: true, status: true },
      }),
      "Sala de Stop não encontrada.",
    );
    if (room.status !== "PLAYING") throw new AppError("A partida não está ativa.", 409);
    await db.gameRoom.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
    const session = await activeSession(db, roomId);
    const round = currentRound(session);
    if (round.id !== action.roundId) throw new AppError("A rodada já mudou.", 409);
    const now = new Date();
    const expired = await expireRoundIfNeeded(db, session, round, now);
    if (expired) return;
    if (round.status === "REVIEWING" && round.reviewDeadline && round.reviewDeadline <= now) {
      await finishReviewCategory(
        db,
        session,
        round,
        stopRulesSchema.parse(room.rules),
        roomId,
        now,
      );
      return;
    }

    if (action.action === "SAVE_ANSWERS") {
      if (now >= round.bonusDeadline) return;
      await saveAnswers(db, userId, session, round, action.answers);
      return;
    }

    const player = assertFound(
      session.players.find((candidate) => candidate.userId === userId),
      "Você não participa desta partida.",
    );
    if (action.action === "STOP_ROUND") {
      if (round.status !== "ANSWERING") throw new AppError("A rodada já foi encerrada.", 409);
      await db.stopRound.update({
        where: { id: round.id },
        data: {
          status: "REVIEWING",
          reviewStartedAt: now,
          reviewDeadline: reviewDeadline(now, session, round, 0),
          reviewCategoryIndex: 0,
          stoppedById: userId,
          stoppedByName: player.name,
          stoppedAt: now,
        },
      });
      return;
    }

    if (action.action === "TOGGLE_INVALID") {
      if (round.status !== "REVIEWING") throw new AppError("A revisão desta rodada terminou.", 409);
      const category = assertFound(
        session.categories[round.reviewCategoryIndex],
        "Categoria de revisão inválida.",
      );
      const answer = assertFound(
        round.answers.find(
          (candidate) => candidate.id === action.answerId && candidate.categoryId === category.id,
        ),
        "Resposta não encontrada nesta categoria.",
      );
      if (answer.userId === userId)
        throw new AppError("Você não pode invalidar a própria resposta.", 403);
      const existing = answer.invalidVotes.some((vote) => vote.voterId === userId);
      if (existing)
        await db.stopInvalidVote.delete({
          where: { answerId_voterId: { answerId: answer.id, voterId: userId } },
        });
      else await db.stopInvalidVote.create({ data: { answerId: answer.id, voterId: userId } });
    }
  });
}

export { stopInvalidVoteThreshold };
