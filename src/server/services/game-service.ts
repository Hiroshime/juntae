import { randomInt } from "node:crypto";
import { GameMatchOutcome, Prisma, type CommunityRole } from "@prisma/client";
import {
  addCivilDays,
  civilDateInTimeZone,
  formatCivilDate,
  parseCivilDate,
  utcRangeForCivilDate,
} from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import {
  addHangmanLetter,
  isHangmanWordComplete,
  normalizeHangmanText,
  revealHangmanWord,
} from "@/lib/games/hangman";
import {
  applyTicTacToeMove,
  evaluateTicTacToe,
  oppositeTicTacToeMark,
  TIC_TAC_TOE_EMPTY_BOARD,
  type TicTacToeMark,
} from "@/lib/games/tic-tac-toe";
import {
  createGameRoomSchema,
  gameRoomActionSchema,
  hangmanGuessSchema,
  hangmanRulesSchema,
  hangmanSecretSchema,
  ticTacToeMoveSchema,
  ticTacToeRulesSchema,
  type CreateGameRoomInput,
  type GameRoomAction,
  type HangmanGuessInput,
  type HangmanSecretInput,
  type TicTacToeMoveInput,
} from "@/lib/validation/games";
import { AppError, assertFound } from "@/server/errors";

const LEADERBOARD_LIMIT = 10;
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "America/Sao_Paulo";

async function membership(db: Prisma.TransactionClient, userId: string, communityId: string) {
  return assertFound(
    await db.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        role: true,
        displayName: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
    "Você não participa desta comunidade.",
  );
}

function displayName(member: { displayName: string | null; user: { name: string } }) {
  return member.displayName || member.user.name;
}

function canManage(userId: string, role: CommunityRole, createdById: string) {
  return userId === createdById || role === "OWNER" || role === "ADMIN";
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
          "A sala mudou enquanto você jogava. Atualize e tente novamente.",
          409,
          "CONFLICT",
        );
    }
  }
  throw new Error("Unreachable transaction retry");
}

const roomInclude = {
  createdBy: { select: { name: true } },
  players: {
    orderBy: { seat: "asc" },
    select: {
      userId: true,
      seat: true,
      ready: true,
      member: {
        select: {
          displayName: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      },
    },
  },
  matches: { orderBy: { startedAt: "desc" }, take: 2 },
  hangmanSessions: {
    orderBy: { startedAt: "desc" },
    take: 2,
    include: {
      players: { orderBy: { turnOrder: "asc" } },
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 2,
        include: { guesses: { orderBy: { turnNumber: "asc" } } },
      },
    },
  },
} satisfies Prisma.GameRoomInclude;

type RoomWithDetails = Prisma.GameRoomGetPayload<{ include: typeof roomInclude }>;

function matchPlayerMark(match: RoomWithDetails["matches"][number], userId: string) {
  if (match.playerXId === userId) return "X" as const;
  if (match.playerOId === userId) return "O" as const;
  return null;
}

function serializeMatch(match: RoomWithDetails["matches"][number] | undefined) {
  if (!match) return null;
  const evaluation = evaluateTicTacToe(match.board);
  return {
    id: match.id,
    roundNumber: match.roundNumber,
    status: match.status,
    outcome: match.outcome,
    board: match.board,
    playerXId: match.playerXId,
    playerXName: match.playerXName,
    playerOId: match.playerOId,
    playerOName: match.playerOName,
    nextTurnUserId: match.nextTurnUserId,
    winnerId: match.winnerId,
    winnerName: match.winnerName,
    winningLine: evaluation.winningLine,
    startedAt: match.startedAt.toISOString(),
    finishedAt: match.finishedAt?.toISOString() ?? null,
  };
}

type HangmanSessionWithDetails = RoomWithDetails["hangmanSessions"][number];

function serializeHangmanSession(session: HangmanSessionWithDetails | undefined, userId: string) {
  if (!session) return null;
  const currentRound = session.rounds.find(
    (round) => round.roundNumber === session.currentRoundNumber,
  );
  const previousRound = session.rounds.find(
    (round) => round.status === "FINISHED" && round.id !== currentRound?.id,
  );
  const maxScore = Math.max(...session.players.map((player) => player.score));
  const serializeRound = (round: (typeof session.rounds)[number] | undefined) => {
    if (!round) return null;
    const maySeeSecret = round.status === "FINISHED" || round.setterId === userId;
    return {
      id: round.id,
      roundNumber: round.roundNumber,
      setterId: round.setterId,
      setterName: round.setterName,
      status: round.status,
      outcome: round.outcome,
      clue: round.clue,
      guessedLetters: Array.from(round.guessedLetters),
      wrongCount: round.wrongCount,
      maskedWord: round.secretWord
        ? round.status === "FINISHED"
          ? round.secretWord.toLocaleUpperCase("pt-BR")
          : revealHangmanWord(round.secretWord, round.guessedLetters)
        : null,
      secretWord: maySeeSecret ? round.secretWord : null,
      currentTurnUserId: round.currentTurnUserId,
      winnerId: round.winnerId,
      winnerName: round.winnerName,
      guesses: round.guesses.map((guess) => ({
        id: guess.id,
        userId: guess.userId,
        userName: guess.userName,
        type: guess.type,
        value: guess.value,
        correct: guess.correct,
        turnNumber: guess.turnNumber,
      })),
      startedAt: round.startedAt.toISOString(),
      finishedAt: round.finishedAt?.toISOString() ?? null,
    };
  };
  return {
    id: session.id,
    status: session.status,
    totalRounds: session.totalRounds,
    currentRoundNumber: session.currentRoundNumber,
    players: session.players.map((player) => ({
      userId: player.userId,
      name: player.name,
      turnOrder: player.turnOrder,
      score: player.score,
      winner: session.status === "FINISHED" && player.score === maxScore,
    })),
    currentRound: serializeRound(currentRound),
    previousRound: serializeRound(previousRound),
    cancellationReason: session.cancellationReason,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
  };
}

function serializeRoom(room: RoomWithDetails, userId: string, role: CommunityRole) {
  const currentMatch = room.matches.find((match) => match.status === "ACTIVE");
  const lastMatch = room.matches.find((match) => match.status === "FINISHED");
  const currentHangmanSession = room.hangmanSessions.find((session) => session.status === "ACTIVE");
  const lastHangmanSession = room.hangmanSessions.find((session) => session.status !== "ACTIVE");
  const player = room.players.find((candidate) => candidate.userId === userId);
  const capacity = room.gameType === "HANGMAN" ? 5 : 2;
  return {
    id: room.id,
    communityId: room.communityId,
    gameType: room.gameType,
    name: room.name,
    status: room.status,
    rules:
      room.gameType === "HANGMAN"
        ? hangmanRulesSchema.parse(room.rules)
        : ticTacToeRulesSchema.parse(room.rules),
    roundNumber: room.roundNumber,
    version: room.version,
    createdByName: room.createdBy.name,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    players: room.players.map((item) => ({
      userId: item.userId,
      seat: item.seat,
      ready: item.ready,
      name: displayName(item.member),
      avatarUrl: item.member.user.avatarUrl,
      mark: currentMatch ? matchPlayerMark(currentMatch, item.userId) : null,
    })),
    currentMatch: serializeMatch(currentMatch),
    lastMatch: serializeMatch(lastMatch),
    hangman: {
      currentSession: serializeHangmanSession(currentHangmanSession, userId),
      lastSession: serializeHangmanSession(lastHangmanSession, userId),
    },
    viewer: {
      userId,
      isPlayer: Boolean(player),
      ready: player?.ready ?? false,
      mark: currentMatch ? matchPlayerMark(currentMatch, userId) : null,
      canJoin: !player && room.status === "WAITING" && room.players.length < capacity,
      canManage: canManage(userId, role, room.createdById),
    },
  };
}

function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

async function roomById(db: Prisma.TransactionClient, communityId: string, roomId: string) {
  return assertFound(
    await db.gameRoom.findFirst({ where: { id: roomId, communityId }, include: roomInclude }),
    "Sala não encontrada.",
  );
}

export async function createGameRoom(
  userId: string,
  communityId: string,
  rawInput: CreateGameRoomInput,
) {
  const parsed = createGameRoomSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  return transaction(async (db) => {
    await membership(db, userId, communityId);
    const room = await db.gameRoom.create({
      data: {
        communityId,
        createdById: userId,
        gameType: parsed.data.gameType,
        name: parsed.data.name,
        rules: parsed.data.rules,
      },
      select: { id: true },
    });
    await db.gameRoomPlayer.create({
      data: { roomId: room.id, communityId, userId, seat: 1 },
    });
    return room;
  });
}

export async function getGameRoom(userId: string, communityId: string, roomId: string) {
  const member = await membership(prisma, userId, communityId);
  return serializeRoom(await roomById(prisma, communityId, roomId), userId, member.role);
}

function periodBounds(now: Date) {
  const today = civilDateInTimeZone(now, DEFAULT_TIMEZONE);
  const weekday = parseCivilDate(today).getUTCDay();
  const weekStart = addCivilDays(today, -(weekday === 0 ? 6 : weekday - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthDate = parseCivilDate(monthStart);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const monthEndExclusive = formatCivilDate(nextMonthDate);
  return {
    week: {
      startDate: weekStart,
      endDate: addCivilDays(weekStart, 6),
      start: utcRangeForCivilDate(weekStart, DEFAULT_TIMEZONE).start,
      end: utcRangeForCivilDate(addCivilDays(weekStart, 7), DEFAULT_TIMEZONE).start,
    },
    month: {
      startDate: monthStart,
      endDate: addCivilDays(monthEndExclusive, -1),
      start: utcRangeForCivilDate(monthStart, DEFAULT_TIMEZONE).start,
      end: utcRangeForCivilDate(monthEndExclusive, DEFAULT_TIMEZONE).start,
    },
  };
}

type RankingMember = {
  userId: string;
  displayName: string | null;
  user: { name: string; avatarUrl: string | null };
};

type RankingMatch = {
  playerXId: string;
  playerOId: string;
  winnerId: string | null;
  outcome: GameMatchOutcome | null;
};

function buildRanking(members: RankingMember[], matches: RankingMatch[]) {
  const stats = new Map(
    members.map((member) => [
      member.userId,
      {
        userId: member.userId,
        name: displayName(member),
        avatarUrl: member.user.avatarUrl,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0,
      },
    ]),
  );
  for (const match of matches) {
    const x = stats.get(match.playerXId);
    const o = stats.get(match.playerOId);
    if (x) x.games += 1;
    if (o) o.games += 1;
    if (match.outcome === "DRAW") {
      if (x) x.draws += 1;
      if (o) o.draws += 1;
    } else {
      const winner = match.winnerId ? stats.get(match.winnerId) : null;
      const loserId = match.winnerId === match.playerXId ? match.playerOId : match.playerXId;
      const loser = stats.get(loserId);
      if (winner) winner.wins += 1;
      if (loser) loser.losses += 1;
    }
  }
  let previousWins: number | null = null;
  let previousRank = 0;
  return [...stats.values()]
    .filter((entry) => entry.games > 0)
    .sort(
      (left, right) =>
        right.wins - left.wins || right.games - left.games || left.name.localeCompare(right.name),
    )
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => {
      const rank = previousWins === entry.wins ? previousRank : index + 1;
      previousWins = entry.wins;
      previousRank = rank;
      return { rank, ...entry };
    });
}

type HangmanRankingSession = {
  players: { userId: string; score: number }[];
};

function buildHangmanRanking(members: RankingMember[], sessions: HangmanRankingSession[]) {
  const stats = new Map(
    members.map((member) => [
      member.userId,
      {
        userId: member.userId,
        name: displayName(member),
        avatarUrl: member.user.avatarUrl,
        wins: 0,
        losses: 0,
        draws: 0,
        games: 0,
      },
    ]),
  );
  for (const session of sessions) {
    const maxScore = Math.max(...session.players.map((player) => player.score));
    const winners = session.players.filter((player) => player.score === maxScore);
    const allTied = winners.length === session.players.length;
    for (const player of session.players) {
      const entry = stats.get(player.userId);
      if (!entry) continue;
      entry.games += 1;
      if (allTied) entry.draws += 1;
      else if (player.score === maxScore) entry.wins += 1;
      else entry.losses += 1;
    }
  }
  let previousWins: number | null = null;
  let previousRank = 0;
  return [...stats.values()]
    .filter((entry) => entry.games > 0)
    .sort(
      (left, right) =>
        right.wins - left.wins || right.games - left.games || left.name.localeCompare(right.name),
    )
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => {
      const rank = previousWins === entry.wins ? previousRank : index + 1;
      previousWins = entry.wins;
      previousRank = rank;
      return { rank, ...entry };
    });
}

export async function listGameHub(userId: string, communityId: string, now = new Date()) {
  await membership(prisma, userId, communityId);
  const bounds = periodBounds(now);
  const [rooms, members, weekMatches, monthMatches, hangmanWeek, hangmanMonth] = await Promise.all([
    prisma.gameRoom.findMany({
      where: { communityId, status: { not: "CLOSED" } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
      take: 30,
      select: {
        id: true,
        name: true,
        gameType: true,
        status: true,
        updatedAt: true,
        players: {
          orderBy: { seat: "asc" },
          select: {
            userId: true,
            member: { select: { displayName: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.communityMember.findMany({
      where: { communityId },
      select: {
        userId: true,
        displayName: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    }),
    prisma.gameMatch.findMany({
      where: {
        communityId,
        gameType: "TIC_TAC_TOE",
        status: "FINISHED",
        finishedAt: { gte: bounds.week.start, lt: bounds.week.end },
      },
      select: { playerXId: true, playerOId: true, winnerId: true, outcome: true },
    }),
    prisma.gameMatch.findMany({
      where: {
        communityId,
        gameType: "TIC_TAC_TOE",
        status: "FINISHED",
        finishedAt: { gte: bounds.month.start, lt: bounds.month.end },
      },
      select: { playerXId: true, playerOId: true, winnerId: true, outcome: true },
    }),
    prisma.hangmanSession.findMany({
      where: {
        communityId,
        status: "FINISHED",
        finishedAt: { gte: bounds.week.start, lt: bounds.week.end },
      },
      select: { players: { select: { userId: true, score: true } } },
    }),
    prisma.hangmanSession.findMany({
      where: {
        communityId,
        status: "FINISHED",
        finishedAt: { gte: bounds.month.start, lt: bounds.month.end },
      },
      select: { players: { select: { userId: true, score: true } } },
    }),
  ]);
  return {
    rooms: rooms.map((room) => ({
      ...room,
      updatedAt: room.updatedAt.toISOString(),
      players: room.players.map((player) => ({
        userId: player.userId,
        name: displayName(player.member),
      })),
    })),
    leaderboards: {
      week: {
        startDate: bounds.week.startDate,
        endDate: bounds.week.endDate,
        entries: buildRanking(members, weekMatches),
      },
      month: {
        startDate: bounds.month.startDate,
        endDate: bounds.month.endDate,
        entries: buildRanking(members, monthMatches),
      },
    },
    hangmanLeaderboards: {
      week: {
        startDate: bounds.week.startDate,
        endDate: bounds.week.endDate,
        entries: buildHangmanRanking(members, hangmanWeek),
      },
      month: {
        startDate: bounds.month.startDate,
        endDate: bounds.month.endDate,
        entries: buildHangmanRanking(members, hangmanMonth),
      },
    },
  };
}

async function startTicTacToeMatch(db: Prisma.TransactionClient, room: RoomWithDetails) {
  if (room.players.length !== 2 || room.players.some((player) => !player.ready)) return;
  const rules = ticTacToeRulesSchema.parse(room.rules);
  const ordered = [...room.players].sort((left, right) => left.seat - right.seat);
  const nextRound = room.roundNumber + 1;
  const firstIsX = rules.starterMode === "RANDOM" ? randomInt(2) === 0 : nextRound % 2 === 1;
  const playerX = firstIsX ? ordered[0] : ordered[1];
  const playerO = firstIsX ? ordered[1] : ordered[0];
  await db.gameMatch.create({
    data: {
      roomId: room.id,
      communityId: room.communityId,
      gameType: room.gameType,
      roundNumber: nextRound,
      board: TIC_TAC_TOE_EMPTY_BOARD,
      playerXId: playerX.userId,
      playerXName: displayName(playerX.member),
      playerOId: playerO.userId,
      playerOName: displayName(playerO.member),
      nextTurnUserId: playerX.userId,
    },
  });
  await db.gameRoom.update({
    where: { id: room.id },
    data: { status: "PLAYING", roundNumber: nextRound, version: { increment: 1 } },
  });
}

async function startHangmanSession(db: Prisma.TransactionClient, room: RoomWithDetails) {
  if (
    room.players.length < 2 ||
    room.players.length > 5 ||
    room.players.some((player) => !player.ready)
  )
    return;
  const rules = hangmanRulesSchema.parse(room.rules);
  const ordered = shuffled(room.players);
  const setter = ordered[0];
  await db.hangmanSession.create({
    data: {
      roomId: room.id,
      communityId: room.communityId,
      totalRounds: rules.wordCount,
      players: {
        create: ordered.map((player, index) => ({
          userId: player.userId,
          name: displayName(player.member),
          turnOrder: index + 1,
        })),
      },
      rounds: {
        create: {
          roundNumber: 1,
          setterId: setter.userId,
          setterName: displayName(setter.member),
        },
      },
    },
  });
  await db.gameRoom.update({
    where: { id: room.id },
    data: {
      status: "PLAYING",
      roundNumber: { increment: 1 },
      version: { increment: 1 },
    },
  });
}

async function cancelHangmanSession(db: Prisma.TransactionClient, roomId: string, reason: string) {
  const session = await db.hangmanSession.findFirst({
    where: { roomId, status: "ACTIVE" },
    include: {
      rounds: { orderBy: { roundNumber: "desc" }, take: 1 },
    },
  });
  if (!session) return;
  const now = new Date();
  const round = session.rounds[0];
  if (round)
    await db.hangmanRound.update({
      where: { id: round.id },
      data: {
        status: "FINISHED",
        outcome: "CANCELLED",
        currentTurnUserId: null,
        winnerId: null,
        winnerName: null,
        finishedAt: now,
      },
    });
  await db.hangmanSession.update({
    where: { id: session.id },
    data: { status: "CANCELLED", cancelledAt: now, cancellationReason: reason },
  });
  await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
  await db.gameRoom.update({
    where: { id: roomId },
    data: { status: "WAITING", version: { increment: 1 } },
  });
}

async function finishByForfeit(
  db: Prisma.TransactionClient,
  roomId: string,
  leavingUserId: string,
) {
  const match = await db.gameMatch.findFirst({
    where: { roomId, status: "ACTIVE" },
  });
  if (!match) return;
  if (leavingUserId !== match.playerXId && leavingUserId !== match.playerOId) return;
  const xWins = leavingUserId === match.playerOId;
  await db.gameMatch.update({
    where: { id: match.id },
    data: {
      status: "FINISHED",
      outcome: xWins ? "X_WON_FORFEIT" : "O_WON_FORFEIT",
      nextTurnUserId: null,
      winnerId: xWins ? match.playerXId : match.playerOId,
      winnerName: xWins ? match.playerXName : match.playerOName,
      finishedAt: new Date(),
    },
  });
  await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
  await db.gameRoom.update({
    where: { id: roomId },
    data: { status: "WAITING", version: { increment: 1 } },
  });
}

export async function changeGameRoom(
  userId: string,
  communityId: string,
  roomId: string,
  rawAction: GameRoomAction,
) {
  const parsed = gameRoomActionSchema.safeParse(rawAction);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await transaction(async (db) => {
    const member = await membership(db, userId, communityId);
    let room = await roomById(db, communityId, roomId);
    await db.gameRoom.update({ where: { id: room.id }, data: { version: { increment: 1 } } });
    const action = parsed.data;

    if (action.action === "JOIN") {
      if (room.status !== "WAITING") throw new AppError("A partida já começou.", 409);
      if (room.players.some((player) => player.userId === userId)) return;
      const capacity = room.gameType === "HANGMAN" ? 5 : 2;
      if (room.players.length >= capacity) throw new AppError("A sala já está cheia.", 409);
      const seat = Array.from({ length: capacity }, (_, index) => index + 1).find(
        (candidate) => !room.players.some((player) => player.seat === candidate),
      );
      if (!seat) throw new AppError("A sala já está cheia.", 409);
      await db.gameRoomPlayer.create({ data: { roomId, communityId, userId, seat } });
      return;
    }

    if (action.action === "LEAVE") {
      if (!room.players.some((player) => player.userId === userId)) return;
      if (room.status === "PLAYING") {
        if (room.gameType === "HANGMAN")
          await cancelHangmanSession(db, roomId, `${displayName(member)} saiu durante a partida.`);
        else await finishByForfeit(db, roomId, userId);
      }
      await db.gameRoomPlayer.delete({ where: { roomId_userId: { roomId, userId } } });
      if (room.players.length === 1) {
        // Keep the room row and its matches for leaderboard history, but remove it from active lists.
        await db.gameRoom.update({ where: { id: roomId }, data: { status: "CLOSED" } });
      }
      return;
    }

    if (action.action === "SET_READY") {
      if (room.status !== "WAITING") throw new AppError("A partida já começou.", 409);
      if (!room.players.some((player) => player.userId === userId))
        throw new AppError("Entre na sala antes de marcar presença.", 403);
      await db.gameRoomPlayer.update({
        where: { roomId_userId: { roomId, userId } },
        data: { ready: action.ready },
      });
      room = await roomById(db, communityId, roomId);
      if (room.gameType === "HANGMAN") await startHangmanSession(db, room);
      else await startTicTacToeMatch(db, room);
      return;
    }

    if (!canManage(userId, member.role, room.createdById))
      throw new AppError("Só o criador e administradores podem configurar a sala.", 403);

    if (action.action === "UPDATE_RULES") {
      if (room.status !== "WAITING" || room.players.some((player) => player.ready))
        throw new AppError("Desmarque todos como prontos antes de alterar as regras.", 409);
      const rules =
        room.gameType === "HANGMAN"
          ? hangmanRulesSchema.safeParse(action.rules)
          : ticTacToeRulesSchema.safeParse(action.rules);
      if (!rules.success) throw new AppError("Regras incompatíveis com este jogo.");
      await db.gameRoom.update({ where: { id: roomId }, data: { rules: rules.data } });
      return;
    }

    if (action.action === "CLOSE") {
      if (room.status === "PLAYING")
        throw new AppError("Finalize a partida antes de fechar a sala.", 409);
      await db.gameRoom.update({ where: { id: roomId }, data: { status: "CLOSED" } });
      await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
      return;
    }

    if (room.status !== "CLOSED") return;
    await db.gameRoom.update({ where: { id: roomId }, data: { status: "WAITING" } });
  });
  return getGameRoom(userId, communityId, roomId);
}

export async function playTicTacToeMove(
  userId: string,
  communityId: string,
  roomId: string,
  rawInput: TicTacToeMoveInput,
) {
  const parsed = ticTacToeMoveSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await transaction(async (db) => {
    await membership(db, userId, communityId);
    const room = await roomById(db, communityId, roomId);
    await db.gameRoom.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
    if (room.status !== "PLAYING") throw new AppError("Não há uma partida em andamento.", 409);
    const match = assertFound(
      room.matches.find(
        (candidate) => candidate.id === parsed.data.matchId && candidate.status === "ACTIVE",
      ),
      "Esta partida não está mais ativa.",
    );
    if (match.nextTurnUserId !== userId) throw new AppError("Aguarde a sua vez.", 409);
    const mark: TicTacToeMark = match.playerXId === userId ? "X" : "O";
    if (matchPlayerMark(match, userId) !== mark)
      throw new AppError("Você não joga esta partida.", 403);
    let board: string;
    try {
      board = applyTicTacToeMove(match.board, parsed.data.cell, mark);
    } catch (error) {
      throw new AppError(error instanceof Error ? error.message : "Jogada inválida.", 409);
    }
    const result = evaluateTicTacToe(board);
    if (result.winner || result.draw) {
      const winnerId =
        result.winner === "X" ? match.playerXId : result.winner === "O" ? match.playerOId : null;
      const winnerName =
        result.winner === "X"
          ? match.playerXName
          : result.winner === "O"
            ? match.playerOName
            : null;
      await db.gameMatch.update({
        where: { id: match.id },
        data: {
          board,
          status: "FINISHED",
          outcome: result.draw ? "DRAW" : result.winner === "X" ? "X_WON" : "O_WON",
          nextTurnUserId: null,
          winnerId,
          winnerName,
          finishedAt: new Date(),
        },
      });
      await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
      await db.gameRoom.update({
        where: { id: roomId },
        data: { status: "WAITING", version: { increment: 1 } },
      });
      return;
    }
    await db.gameMatch.update({
      where: { id: match.id },
      data: {
        board,
        nextTurnUserId: oppositeTicTacToeMark(mark) === "X" ? match.playerXId : match.playerOId,
      },
    });
  });
  return getGameRoom(userId, communityId, roomId);
}

const hangmanSessionInclude = {
  players: { orderBy: { turnOrder: "asc" } },
  rounds: {
    orderBy: { roundNumber: "desc" },
    take: 1,
    include: { guesses: { orderBy: { turnNumber: "asc" } } },
  },
} satisfies Prisma.HangmanSessionInclude;

type ActiveHangmanSession = Prisma.HangmanSessionGetPayload<{
  include: typeof hangmanSessionInclude;
}>;

async function activeHangmanSession(db: Prisma.TransactionClient, roomId: string) {
  return assertFound(
    await db.hangmanSession.findFirst({
      where: { roomId, status: "ACTIVE" },
      include: hangmanSessionInclude,
    }),
    "Não há uma partida de forca em andamento.",
  );
}

function nextHangmanPlayer(
  players: ActiveHangmanSession["players"],
  afterUserId: string,
  skipUserId?: string,
) {
  const index = players.findIndex((player) => player.userId === afterUserId);
  if (index < 0) throw new AppError("A ordem de jogadores ficou inválida.", 409);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(index + offset) % players.length];
    if (candidate.userId !== skipUserId) return candidate;
  }
  throw new AppError("Não há outro jogador disponível.", 409);
}

export async function setHangmanSecret(
  userId: string,
  communityId: string,
  roomId: string,
  rawInput: HangmanSecretInput,
) {
  const parsed = hangmanSecretSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await transaction(async (db) => {
    await membership(db, userId, communityId);
    const room = await roomById(db, communityId, roomId);
    if (room.gameType !== "HANGMAN" || room.status !== "PLAYING")
      throw new AppError("Não há uma partida de forca em andamento.", 409);
    await db.gameRoom.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
    const session = await activeHangmanSession(db, roomId);
    const round = assertFound(session.rounds[0], "Rodada não encontrada.");
    if (round.id !== parsed.data.roundId || round.status !== "SETTING_WORD")
      throw new AppError("Esta rodada não aceita mais uma palavra.", 409);
    if (round.setterId !== userId)
      throw new AppError("Somente o mestre desta rodada pode definir a palavra.", 403);
    const normalizedWord = normalizeHangmanText(parsed.data.word);
    const firstPlayer = nextHangmanPlayer(session.players, round.setterId, round.setterId);
    await db.hangmanRound.update({
      where: { id: round.id },
      data: {
        status: "GUESSING",
        secretWord: parsed.data.word.replace(/\s+/g, " ").trim(),
        normalizedWord,
        clue: parsed.data.clue || null,
        wordSetAt: new Date(),
        currentTurnUserId: firstPlayer.userId,
      },
    });
  });
  return getGameRoom(userId, communityId, roomId);
}

export async function submitHangmanGuess(
  userId: string,
  communityId: string,
  roomId: string,
  rawInput: HangmanGuessInput,
) {
  const parsed = hangmanGuessSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  await transaction(async (db) => {
    const member = await membership(db, userId, communityId);
    const room = await roomById(db, communityId, roomId);
    if (room.gameType !== "HANGMAN" || room.status !== "PLAYING")
      throw new AppError("Não há uma partida de forca em andamento.", 409);
    await db.gameRoom.update({ where: { id: roomId }, data: { version: { increment: 1 } } });
    const session = await activeHangmanSession(db, roomId);
    const round = assertFound(session.rounds[0], "Rodada não encontrada.");
    if (round.id !== parsed.data.roundId || round.status !== "GUESSING")
      throw new AppError("Esta rodada não aceita mais palpites.", 409);
    if (round.currentTurnUserId !== userId) throw new AppError("Aguarde a sua vez.", 409);
    if (round.setterId === userId) throw new AppError("O mestre não chuta a própria palavra.", 403);
    if (!session.players.some((player) => player.userId === userId))
      throw new AppError("Você não participa desta partida.", 403);
    const normalizedValue = normalizeHangmanText(parsed.data.value);
    let guessedLetters = round.guessedLetters;
    let correct = false;
    let completed = false;
    if (parsed.data.type === "LETTER") {
      try {
        guessedLetters = addHangmanLetter(round.guessedLetters, parsed.data.value);
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Letra inválida.", 409);
      }
      correct = Boolean(round.normalizedWord?.includes(normalizedValue));
      completed = Boolean(
        correct &&
        round.normalizedWord &&
        isHangmanWordComplete(round.normalizedWord, guessedLetters),
      );
    } else {
      correct = normalizedValue === round.normalizedWord;
      completed = correct;
    }
    const wrongCount = round.wrongCount + (correct ? 0 : 1);
    const turnNumber = round.guesses.length + 1;
    await db.hangmanGuess.create({
      data: {
        roundId: round.id,
        userId,
        userName: displayName(member),
        type: parsed.data.type,
        value:
          parsed.data.type === "LETTER"
            ? normalizedValue
            : parsed.data.value.replace(/\s+/g, " ").trim(),
        normalizedValue,
        correct,
        turnNumber,
      },
    });

    const finished = completed || wrongCount >= 10;
    if (!finished) {
      const nextPlayer = nextHangmanPlayer(session.players, userId, round.setterId);
      await db.hangmanRound.update({
        where: { id: round.id },
        data: { guessedLetters, wrongCount, currentTurnUserId: nextPlayer.userId },
      });
      return;
    }

    const now = new Date();
    const winner = completed
      ? assertFound(
          session.players.find((player) => player.userId === userId),
          "Jogador não encontrado.",
        )
      : null;
    await db.hangmanRound.update({
      where: { id: round.id },
      data: {
        status: "FINISHED",
        outcome: completed ? "GUESSED" : "HANGED",
        guessedLetters,
        wrongCount,
        currentTurnUserId: null,
        winnerId: winner?.userId ?? null,
        winnerName: winner?.name ?? null,
        finishedAt: now,
      },
    });
    if (winner)
      await db.hangmanSessionPlayer.update({
        where: { sessionId_userId: { sessionId: session.id, userId } },
        data: { score: { increment: 1 } },
      });

    if (round.roundNumber >= session.totalRounds) {
      await db.hangmanSession.update({
        where: { id: session.id },
        data: { status: "FINISHED", finishedAt: now },
      });
      await db.gameRoomPlayer.updateMany({ where: { roomId }, data: { ready: false } });
      await db.gameRoom.update({ where: { id: roomId }, data: { status: "WAITING" } });
      return;
    }

    const nextSetter = nextHangmanPlayer(session.players, round.setterId);
    const nextRoundNumber = round.roundNumber + 1;
    await db.hangmanRound.create({
      data: {
        sessionId: session.id,
        roundNumber: nextRoundNumber,
        setterId: nextSetter.userId,
        setterName: nextSetter.name,
      },
    });
    await db.hangmanSession.update({
      where: { id: session.id },
      data: { currentRoundNumber: nextRoundNumber },
    });
  });
  return getGameRoom(userId, communityId, roomId);
}

export async function prepareGamesForMemberRemoval(
  db: Prisma.TransactionClient,
  communityId: string,
  userId: string,
) {
  const seats = await db.gameRoomPlayer.findMany({
    where: { communityId, userId },
    select: { roomId: true },
  });
  for (const seat of seats) {
    const room = await roomById(db, communityId, seat.roomId);
    await db.gameRoom.update({
      where: { id: seat.roomId },
      data: { version: { increment: 1 } },
    });
    if (room.gameType === "HANGMAN")
      await cancelHangmanSession(
        db,
        seat.roomId,
        `${displayName(room.players.find((player) => player.userId === userId)!.member)} foi removido da comunidade.`,
      );
    else await finishByForfeit(db, seat.roomId, userId);
    if (room.players.length === 1)
      await db.gameRoom.update({ where: { id: seat.roomId }, data: { status: "CLOSED" } });
  }
}

export type GameRoomDetail = Awaited<ReturnType<typeof getGameRoom>>;
export type GameHub = Awaited<ReturnType<typeof listGameHub>>;
