import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  addCivilDays,
  civilDateInTimeZone,
  formatCivilDate,
  parseCivilDate,
  utcRangeForCivilDate,
} from "@/lib/dates/civil-date";
import { bellHopScore } from "@/lib/games/bell-hop";
import { finishBellHopRunSchema, type FinishBellHopRunInput } from "@/lib/validation/games";
import { prisma } from "@/lib/db/prisma";
import { AppError, assertFound } from "@/server/errors";

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo";
const LEADERBOARD_LIMIT = 10;

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
        throw new AppError("O ranking mudou durante a operação. Tente novamente.", 409, "CONFLICT");
    }
  }
  throw new Error("Unreachable transaction retry");
}

async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { displayName: true, user: { select: { name: true } } },
    }),
    "Você não participa desta comunidade.",
  );
}

function periodBounds(now: Date) {
  const today = civilDateInTimeZone(now, DEFAULT_TIMEZONE);
  const weekday = parseCivilDate(today).getUTCDay();
  const weekStart = addCivilDays(today, -(weekday === 0 ? 6 : weekday - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = parseCivilDate(monthStart);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextMonthDate = formatCivilDate(nextMonth);
  return {
    week: {
      startDate: weekStart,
      endDate: addCivilDays(weekStart, 6),
      start: utcRangeForCivilDate(weekStart, DEFAULT_TIMEZONE).start,
      end: utcRangeForCivilDate(addCivilDays(weekStart, 7), DEFAULT_TIMEZONE).start,
    },
    month: {
      startDate: monthStart,
      endDate: addCivilDays(nextMonthDate, -1),
      start: utcRangeForCivilDate(monthStart, DEFAULT_TIMEZONE).start,
      end: utcRangeForCivilDate(nextMonthDate, DEFAULT_TIMEZONE).start,
    },
  };
}

export async function startBellHopRun(userId: string, communityId: string) {
  return transaction(async (db) => {
    const member = await membership(db, userId, communityId);
    const now = new Date();
    await db.bellHopRun.updateMany({
      where: { communityId, userId, status: "ACTIVE" },
      data: { status: "ABANDONED", finishedAt: now },
    });
    const run = await db.bellHopRun.create({
      data: {
        communityId,
        userId,
        playerName: member.displayName || member.user.name,
        seed: randomInt(1, 2_147_483_647),
      },
      select: { id: true, seed: true, startedAt: true },
    });
    return { ...run, startedAt: run.startedAt.toISOString() };
  });
}

export async function finishBellHopRun(
  userId: string,
  communityId: string,
  runId: string,
  rawInput: FinishBellHopRunInput,
) {
  const parsed = finishBellHopRunSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    const run = assertFound(
      await db.bellHopRun.findFirst({ where: { id: runId, communityId, userId } }),
      "Partida não encontrada.",
    );
    if (run.status !== "ACTIVE") throw new AppError("Esta partida já foi encerrada.", 409);
    const now = new Date();
    const serverElapsedMs = Math.max(0, now.getTime() - run.startedAt.getTime());
    if (parsed.data.durationMs > serverElapsedMs + 5_000)
      throw new AppError("A duração informada pela partida é inválida.", 409);
    const plausibleBells = Math.floor(serverElapsedMs / 250) + 2;
    if (parsed.data.bellsHit > plausibleBells)
      throw new AppError("A sequência de sinos não é compatível com a duração da partida.", 409);
    const plausibleHeight = (parsed.data.bellsHit + 3) * 260;
    if (parsed.data.maxHeight > plausibleHeight)
      throw new AppError("A altura informada pela partida é inválida.", 409);

    const score = bellHopScore(parsed.data.bellsHit);
    const updated = await db.bellHopRun.update({
      where: { id: run.id },
      data: {
        status: "FINISHED",
        score,
        bellsHit: parsed.data.bellsHit,
        maxHeight: parsed.data.maxHeight,
        durationMs: Math.min(parsed.data.durationMs, serverElapsedMs),
        finishedAt: now,
      },
      select: { id: true, score: true, bellsHit: true, maxHeight: true, durationMs: true },
    });
    return {
      id: updated.id,
      score: updated.score!,
      bellsHit: updated.bellsHit!,
      maxHeight: updated.maxHeight!,
      durationMs: updated.durationMs!,
    };
  });
}

async function rankingForPeriod(
  communityId: string,
  start: Date,
  end: Date,
  startDate: string,
  endDate: string,
) {
  const [members, grouped] = await Promise.all([
    prisma.communityMember.findMany({
      where: { communityId },
      select: {
        userId: true,
        displayName: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
    prisma.bellHopRun.groupBy({
      by: ["userId"],
      where: { communityId, status: "FINISHED", finishedAt: { gte: start, lt: end } },
      _max: { score: true },
      _count: { id: true },
    }),
  ]);
  const stats = new Map(grouped.map((entry) => [entry.userId, entry]));
  let previousScore: number | null = null;
  let previousRank = 0;
  const entries = members
    .flatMap((member) => {
      const stat = stats.get(member.userId);
      if (!stat?._max.score) return [];
      return [
        {
          userId: member.userId,
          name: member.displayName || member.user.name,
          avatarUrl: member.user.avatarUrl,
          score: stat._max.score,
          attempts: stat._count.id,
        },
      ];
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => {
      const rank = previousScore === entry.score ? previousRank : index + 1;
      previousScore = entry.score;
      previousRank = rank;
      return { rank, ...entry };
    });
  return { startDate, endDate, entries };
}

export async function listBellHopLeaderboards(
  userId: string,
  communityId: string,
  now = new Date(),
) {
  await membership(prisma, userId, communityId);
  const bounds = periodBounds(now);
  const [week, month] = await Promise.all([
    rankingForPeriod(
      communityId,
      bounds.week.start,
      bounds.week.end,
      bounds.week.startDate,
      bounds.week.endDate,
    ),
    rankingForPeriod(
      communityId,
      bounds.month.start,
      bounds.month.end,
      bounds.month.startDate,
      bounds.month.endDate,
    ),
  ]);
  return { week, month };
}

export type BellHopLeaderboards = Awaited<ReturnType<typeof listBellHopLeaderboards>>;
