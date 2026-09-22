import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  changeGameRoom,
  createGameRoom,
  getGameRoom,
  listGameHub,
  setHangmanSecret,
  submitHangmanGuess,
} from "@/server/services/game-service";

describe("partidas de jogo da forca", () => {
  const suffix = randomUUID();
  const userIds: string[] = [];
  let communityId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "bia", "caio", "duda", "enzo", "fabi", "fora"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `hangman-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));
    communityId = (
      await prisma.community.create({
        data: {
          name: "Forca",
          slug: `hangman-${suffix}`,
          createdById: userIds[0],
          members: {
            create: userIds.slice(0, 6).map((userId, index) => ({
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

  async function create(wordCount = 2) {
    return createGameRoom(userIds[0], communityId, {
      gameType: "HANGMAN",
      name: "Forca da turma",
      rules: { version: 1, wordCount },
    });
  }

  async function start(roomId: string, players = userIds.slice(0, 3)) {
    for (const player of players.slice(1))
      await changeGameRoom(player, communityId, roomId, { action: "JOIN" });
    for (const player of players)
      await changeGameRoom(player, communityId, roomId, { action: "SET_READY", ready: true });
    return getGameRoom(players[0], communityId, roomId);
  }

  it("aceita de dois a cinco jogadores e só inicia quando todos estão prontos", async () => {
    const { id } = await create(1);
    await changeGameRoom(userIds[0], communityId, id, { action: "SET_READY", ready: true });
    expect((await getGameRoom(userIds[0], communityId, id)).status).toBe("WAITING");
    for (const player of userIds.slice(1, 5))
      await changeGameRoom(player, communityId, id, { action: "JOIN" });
    expect((await getGameRoom(userIds[0], communityId, id)).players).toHaveLength(5);
    await expect(
      changeGameRoom(userIds[5], communityId, id, { action: "JOIN" }),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(getGameRoom(userIds[6], communityId, id)).rejects.toMatchObject({ status: 404 });
    for (const player of userIds.slice(1, 5))
      await changeGameRoom(player, communityId, id, { action: "SET_READY", ready: true });
    const room = await getGameRoom(userIds[0], communityId, id);
    expect(room.status).toBe("PLAYING");
    expect(room.hangman.currentSession?.players).toHaveLength(5);
    expect(
      new Set(room.hangman.currentSession?.players.map((player) => player.turnOrder)).size,
    ).toBe(5);
  });

  it("protege a palavra, respeita turnos, pontua e troca o mestre", async () => {
    const { id } = await create(2);
    let room = await start(id);
    const session = room.hangman.currentSession!;
    const firstRound = session.currentRound!;
    const setterId = firstRound.setterId;
    const otherId = session.players.find((player) => player.userId !== setterId)!.userId;

    await expect(
      setHangmanSecret(otherId, communityId, id, {
        roundId: firstRound.id,
        word: "Café",
        clue: "Bebida",
      }),
    ).rejects.toMatchObject({ status: 403 });

    room = await setHangmanSecret(setterId, communityId, id, {
      roundId: firstRound.id,
      word: "Café",
      clue: "Bebida",
    });
    const guessing = room.hangman.currentSession!.currentRound!;
    expect(guessing).toMatchObject({ maskedWord: "____", clue: "Bebida", secretWord: "Café" });
    const hidden = await getGameRoom(otherId, communityId, id);
    expect(hidden.hangman.currentSession?.currentRound?.secretWord).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('"secretWord":"Café"');

    const firstGuesser = guessing.currentTurnUserId!;
    await expect(
      submitHangmanGuess(setterId, communityId, id, {
        roundId: guessing.id,
        type: "LETTER",
        value: "c",
      }),
    ).rejects.toMatchObject({ status: 409 });
    room = await submitHangmanGuess(firstGuesser, communityId, id, {
      roundId: guessing.id,
      type: "LETTER",
      value: "x",
    });
    expect(room.hangman.currentSession?.currentRound?.wrongCount).toBe(1);
    const nextGuesser = room.hangman.currentSession!.currentRound!.currentTurnUserId!;
    await expect(
      submitHangmanGuess(nextGuesser, communityId, id, {
        roundId: guessing.id,
        type: "LETTER",
        value: "X",
      }),
    ).rejects.toMatchObject({ status: 409 });

    room = await submitHangmanGuess(nextGuesser, communityId, id, {
      roundId: guessing.id,
      type: "WORD",
      value: "cafe",
    });
    const secondRound = room.hangman.currentSession!.currentRound!;
    expect(secondRound).toMatchObject({ roundNumber: 2, status: "SETTING_WORD" });
    expect(secondRound.setterId).not.toBe(setterId);
    expect(
      room.hangman.currentSession?.players.find((player) => player.userId === nextGuesser)?.score,
    ).toBe(1);

    room = await setHangmanSecret(secondRound.setterId, communityId, id, {
      roundId: secondRound.id,
      word: "Banana",
      clue: "Fruta",
    });
    const wrongWords = [
      "casa",
      "mesa",
      "livro",
      "carro",
      "praia",
      "chuva",
      "vento",
      "pedra",
      "nuvem",
      "terra",
    ];
    for (const value of wrongWords) {
      const current = room.hangman.currentSession!.currentRound!;
      room = await submitHangmanGuess(current.currentTurnUserId!, communityId, id, {
        roundId: current.id,
        type: "WORD",
        value,
      });
    }
    expect(room.status).toBe("WAITING");
    expect(room.hangman.currentSession).toBeNull();
    expect(room.hangman.lastSession).toMatchObject({ status: "FINISHED", totalRounds: 2 });
    expect(room.hangman.lastSession?.currentRound).toMatchObject({
      outcome: "HANGED",
      wrongCount: 10,
      secretWord: "Banana",
    });
    expect(
      room.hangman.lastSession?.players.find((player) => player.userId === nextGuesser),
    ).toMatchObject({
      score: 1,
      winner: true,
    });
    expect(room.players.every((player) => !player.ready)).toBe(true);

    const hub = await listGameHub(userIds[0], communityId);
    expect(
      hub.hangmanLeaderboards.week.entries.find((entry) => entry.userId === nextGuesser)?.wins,
    ).toBeGreaterThanOrEqual(1);
  });

  it("cancela a sessão quando alguém sai e mantém as regras protegidas", async () => {
    const { id } = await create(3);
    await expect(
      changeGameRoom(userIds[1], communityId, id, {
        action: "UPDATE_RULES",
        rules: { version: 1, wordCount: 4 },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await changeGameRoom(userIds[0], communityId, id, {
      action: "UPDATE_RULES",
      rules: { version: 1, wordCount: 4 },
    });
    const room = await start(id, userIds.slice(0, 2));
    expect(room.hangman.currentSession?.totalRounds).toBe(4);
    const leaving = room.hangman.currentSession!.players[1].userId;
    const updated = await changeGameRoom(leaving, communityId, id, { action: "LEAVE" });
    expect(updated.status).toBe("WAITING");
    expect(updated.hangman.lastSession).toMatchObject({ status: "CANCELLED" });
    expect(updated.players).toHaveLength(1);
  });
});
