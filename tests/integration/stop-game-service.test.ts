import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_STOP_CATEGORIES } from "@/lib/games/stop-game";
import {
  changeGameRoom,
  createGameRoom,
  getGameRoom,
  listGameHub,
} from "@/server/services/game-service";
import { changeStopGame } from "@/server/services/stop-game-service";

describe("partidas de Stop da Turma", () => {
  const suffix = randomUUID();
  const userIds: string[] = [];
  let communityId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "bia", "caio", "fora"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `stop-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));
    communityId = (
      await prisma.community.create({
        data: {
          name: "Stop da Turma",
          slug: `stop-${suffix}`,
          createdById: userIds[0],
          members: {
            create: userIds.slice(0, 3).map((userId, index) => ({
              userId,
              role: index === 0 ? "OWNER" : "MEMBER",
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

  afterEach(async () => {
    if (!communityId) return;
    await prisma.stopSession.updateMany({
      where: { communityId, status: "ACTIVE" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: "Limpeza do teste",
      },
    });
    await prisma.gameRoomPlayer.deleteMany({ where: { communityId } });
    await prisma.gameRoom.updateMany({
      where: { communityId, status: { not: "CLOSED" } },
      data: { status: "CLOSED" },
    });
  });

  async function createAndStart() {
    const room = await createGameRoom(userIds[0], communityId, {
      gameType: "STOP",
      name: "Stop de domingo",
      rules: {
        version: 1,
        maxPlayers: 3,
        roundCount: 4,
        answerSeconds: 15,
        letters: ["A"],
        categories: DEFAULT_STOP_CATEGORIES,
      },
    });
    for (const player of userIds.slice(1, 3))
      await changeGameRoom(player, communityId, room.id, { action: "JOIN" });
    for (const player of userIds.slice(0, 3))
      await changeGameRoom(player, communityId, room.id, {
        action: "SET_READY",
        ready: true,
      });
    return getGameRoom(userIds[0], communityId, room.id);
  }

  async function stopAndReviewAll(roomId: string, playerId = userIds[0]) {
    let room = await getGameRoom(playerId, communityId, roomId);
    const roundId = room.stop.currentSession!.currentRound!.id;
    await changeStopGame(playerId, communityId, roomId, { action: "STOP_ROUND", roundId });
    for (let category = 0; category < DEFAULT_STOP_CATEGORIES.length; category += 1)
      await expireReviewCategory(roomId, roundId);
    room = await getGameRoom(playerId, communityId, roomId);
    return room;
  }

  async function expireReviewCategory(roomId: string, roundId: string) {
    await prisma.stopRound.update({
      where: { id: roundId },
      data: { reviewDeadline: new Date(Date.now() - 1_000) },
    });
    return getGameRoom(userIds[0], communityId, roomId);
  }

  it("mantém respostas privadas, decide invalidação por maioria e conclui o ranking", async () => {
    let room = await createAndStart();
    const roomId = room.id;
    expect(room).toMatchObject({ status: "PLAYING", capacity: 3 });
    expect(room.stop.currentSession).toMatchObject({
      totalRounds: 4,
      answerSeconds: 15,
      invalidVoteThreshold: 2,
    });
    await expect(getGameRoom(userIds[3], communityId, roomId)).rejects.toMatchObject({
      status: 404,
    });

    const round = room.stop.currentSession!.currentRound!;
    const [nameCategory, animalCategory] = room.stop.currentSession!.categories;
    await changeStopGame(userIds[0], communityId, roomId, {
      action: "SAVE_ANSWERS",
      roundId: round.id,
      answers: [{ categoryId: nameCategory.id, value: "Amanda" }],
    });
    await changeStopGame(userIds[1], communityId, roomId, {
      action: "SAVE_ANSWERS",
      roundId: round.id,
      answers: [{ categoryId: animalCategory.id, value: "Avestruz" }],
    });
    const ownerView = await getGameRoom(userIds[0], communityId, roomId);
    const memberView = await getGameRoom(userIds[1], communityId, roomId);
    expect(
      ownerView.stop.currentSession?.currentRound?.answers.find(
        (answer) => answer.userId === userIds[0],
      ),
    ).toMatchObject({ value: "Amanda" });
    expect(
      ownerView.stop.currentSession?.currentRound?.answers.find(
        (answer) => answer.userId === userIds[1],
      ),
    ).toMatchObject({ value: null });
    expect(
      memberView.stop.currentSession?.currentRound?.answers.find(
        (answer) => answer.userId === userIds[0],
      ),
    ).toMatchObject({ value: null });
    expect(
      memberView.stop.currentSession?.currentRound?.answers.find(
        (answer) => answer.userId === userIds[1],
      ),
    ).toMatchObject({ value: "Avestruz" });

    await changeStopGame(userIds[1], communityId, roomId, {
      action: "STOP_ROUND",
      roundId: round.id,
    });
    room = await getGameRoom(userIds[0], communityId, roomId);
    expect(room.stop.currentSession?.currentRound).toMatchObject({
      status: "REVIEWING",
      stoppedById: userIds[1],
    });
    expect(
      new Date(room.stop.currentSession!.currentRound!.reviewDeadline!).getTime() - Date.now(),
    ).toBeGreaterThan(18_000);
    const ownerAnswer = room.stop.currentSession!.currentRound!.answers.find(
      (answer) => answer.userId === userIds[0],
    )!;
    await expect(
      changeStopGame(userIds[0], communityId, roomId, {
        action: "TOGGLE_INVALID",
        roundId: round.id,
        answerId: ownerAnswer.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    for (const voterId of userIds.slice(1, 3))
      await changeStopGame(voterId, communityId, roomId, {
        action: "TOGGLE_INVALID",
        roundId: round.id,
        answerId: ownerAnswer.id,
      });

    for (let category = 0; category < DEFAULT_STOP_CATEGORIES.length; category += 1)
      await expireReviewCategory(roomId, round.id);
    room = await getGameRoom(userIds[0], communityId, roomId);
    expect(room.stop.currentSession?.currentRound?.roundNumber).toBe(2);
    expect(
      room.stop.currentSession?.players.find((player) => player.userId === userIds[0])?.score,
    ).toBe(0);
    expect(
      room.stop.currentSession?.players.find((player) => player.userId === userIds[1])?.score,
    ).toBe(1);

    const bonusRoundId = room.stop.currentSession!.currentRound!.id;
    const now = Date.now();
    await prisma.stopRound.update({
      where: { id: bonusRoundId },
      data: {
        answerDeadline: new Date(now - 5_000),
        bonusDeadline: new Date(now + 5_000),
      },
    });
    room = await getGameRoom(userIds[0], communityId, roomId);
    expect(room.stop.currentSession?.currentRound).toMatchObject({
      status: "ANSWERING",
      bonusActive: true,
    });
    await prisma.stopRound.update({
      where: { id: bonusRoundId },
      data: {
        answerDeadline: new Date(now - 11_000),
        bonusDeadline: new Date(now - 1_000),
      },
    });
    room = await getGameRoom(userIds[0], communityId, roomId);
    expect(room.stop.currentSession?.currentRound?.status).toBe("REVIEWING");
    expect(room.stop.currentSession?.currentRound?.reviewSeconds).toBe(10);
    expect(
      new Date(room.stop.currentSession!.currentRound!.reviewDeadline!).getTime() - Date.now(),
    ).toBeGreaterThan(8_000);
    await prisma.stopRound.update({
      where: { id: bonusRoundId },
      data: { reviewDeadline: new Date(Date.now() - 1_000) },
    });
    await changeStopGame(userIds[1], communityId, roomId, {
      action: "TOGGLE_INVALID",
      roundId: bonusRoundId,
      answerId: randomUUID(),
    });
    room = await getGameRoom(userIds[0], communityId, roomId);
    expect(room.stop.currentSession?.currentRound?.reviewCategoryIndex).toBe(1);
    for (let category = 1; category < DEFAULT_STOP_CATEGORIES.length; category += 1)
      await expireReviewCategory(roomId, bonusRoundId);

    room = await stopAndReviewAll(roomId);
    expect(room.stop.currentSession?.currentRound?.roundNumber).toBe(4);
    room = await stopAndReviewAll(roomId);
    expect(room.status).toBe("WAITING");
    expect(room.stop.currentSession).toBeNull();
    expect(room.stop.lastSession).toMatchObject({ status: "FINISHED", totalRounds: 4 });
    expect(
      room.stop.lastSession?.players.find((player) => player.userId === userIds[1]),
    ).toMatchObject({ score: 1, winner: true });
    expect(room.players.every((player) => !player.ready)).toBe(true);

    const hub = await listGameHub(userIds[0], communityId);
    expect(
      hub.stopLeaderboards.week.entries.find((entry) => entry.userId === userIds[1])?.wins,
    ).toBeGreaterThanOrEqual(1);
  });

  it("protege as regras e cancela a sessão quando alguém deixa a sala", async () => {
    const room = await createGameRoom(userIds[0], communityId, {
      gameType: "STOP",
      name: "Stop protegido",
      rules: {
        version: 1,
        maxPlayers: 3,
        roundCount: 4,
        answerSeconds: 15,
        letters: ["A"],
        categories: DEFAULT_STOP_CATEGORIES,
      },
    });
    await changeGameRoom(userIds[1], communityId, room.id, { action: "JOIN" });
    await changeGameRoom(userIds[2], communityId, room.id, { action: "JOIN" });
    await expect(
      changeGameRoom(userIds[1], communityId, room.id, {
        action: "UPDATE_RULES",
        rules: {
          version: 1,
          maxPlayers: 2,
          roundCount: 4,
          answerSeconds: 20,
          letters: ["A"],
          categories: DEFAULT_STOP_CATEGORIES,
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      changeGameRoom(userIds[0], communityId, room.id, {
        action: "UPDATE_RULES",
        rules: {
          version: 1,
          maxPlayers: 2,
          roundCount: 4,
          answerSeconds: 20,
          letters: ["A"],
          categories: DEFAULT_STOP_CATEGORIES,
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    for (const player of userIds.slice(0, 3))
      await changeGameRoom(player, communityId, room.id, {
        action: "SET_READY",
        ready: true,
      });
    const updated = await changeGameRoom(userIds[1], communityId, room.id, { action: "LEAVE" });
    expect(updated.status).toBe("WAITING");
    expect(updated.stop.lastSession).toMatchObject({ status: "CANCELLED" });
    expect(updated.players).toHaveLength(2);
  });
});
