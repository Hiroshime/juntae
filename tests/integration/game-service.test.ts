import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { removeMember } from "@/server/services/community-service";
import {
  changeGameRoom,
  createGameRoom,
  getGameRoom,
  listGameHub,
  playTicTacToeMove,
} from "@/server/services/game-service";

describe("salas e partidas de jogos", () => {
  const suffix = randomUUID();
  let communityId: string;
  let otherCommunityId: string;
  let owner: string;
  let admin: string;
  let member: string;
  let outsider: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `games-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [owner, admin, member, outsider] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Jogos",
          slug: `games-${suffix}`,
          createdById: owner,
          members: {
            create: [
              { userId: owner, role: "OWNER" },
              { userId: admin, role: "ADMIN" },
              { userId: member },
            ],
          },
        },
      })
    ).id;
    otherCommunityId = (
      await prisma.community.create({
        data: {
          name: "Outros jogos",
          slug: `other-games-${suffix}`,
          createdById: outsider,
          members: { create: [{ userId: outsider, role: "OWNER" }] },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.community.deleteMany({
      where: { id: { in: [communityId, otherCommunityId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, admin, member, outsider].filter(Boolean) } },
    });
  });

  async function create(userId = owner, starterMode: "ALTERNATE" | "RANDOM" = "ALTERNATE") {
    return createGameRoom(userId, communityId, {
      gameType: "TIC_TAC_TOE",
      name: "Sala da turma",
      rules: { version: 1, starterMode },
    });
  }

  async function start(roomId: string, first = owner, second = member) {
    await changeGameRoom(second, communityId, roomId, { action: "JOIN" });
    await changeGameRoom(first, communityId, roomId, { action: "SET_READY", ready: true });
    return changeGameRoom(second, communityId, roomId, { action: "SET_READY", ready: true });
  }

  it("mantém comunidade privada e sala limitada a dois jogadores sob concorrência", async () => {
    await expect(create(outsider)).rejects.toMatchObject({ status: 404 });
    const room = await create();
    await expect(getGameRoom(outsider, communityId, room.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getGameRoom(owner, otherCommunityId, room.id)).rejects.toMatchObject({
      status: 404,
    });

    const joins = await Promise.allSettled([
      changeGameRoom(member, communityId, room.id, { action: "JOIN" }),
      changeGameRoom(admin, communityId, room.id, { action: "JOIN" }),
    ]);
    expect(joins.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await getGameRoom(owner, communityId, room.id)).players).toHaveLength(2);
  });

  it("inicia com os dois prontos, valida turnos e encerra preservando o resultado", async () => {
    const { id } = await create();
    let room = await start(id);
    expect(room.status).toBe("PLAYING");
    expect(room.currentMatch?.board).toBe("---------");
    expect(room.currentMatch?.playerXId).toBe(owner);
    expect(await prisma.gameMatch.count({ where: { roomId: id, status: "ACTIVE" } })).toBe(1);

    const matchId = room.currentMatch!.id;
    await expect(
      playTicTacToeMove(member, communityId, id, { matchId, cell: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    room = await playTicTacToeMove(owner, communityId, id, { matchId, cell: 0 });
    expect(room.currentMatch?.board).toBe("X--------");
    await expect(
      playTicTacToeMove(member, communityId, id, { matchId, cell: 0 }),
    ).rejects.toMatchObject({ status: 409 });
    await playTicTacToeMove(member, communityId, id, { matchId, cell: 3 });
    await playTicTacToeMove(owner, communityId, id, { matchId, cell: 1 });
    await playTicTacToeMove(member, communityId, id, { matchId, cell: 4 });
    room = await playTicTacToeMove(owner, communityId, id, { matchId, cell: 2 });

    expect(room).toMatchObject({
      status: "WAITING",
      currentMatch: null,
      lastMatch: { outcome: "X_WON", winnerId: owner, board: "XXXOO----" },
    });
    expect(room.players.every((player) => !player.ready)).toBe(true);

    await changeGameRoom(owner, communityId, id, { action: "SET_READY", ready: true });
    room = await changeGameRoom(member, communityId, id, { action: "SET_READY", ready: true });
    expect(room.currentMatch).toMatchObject({ roundNumber: 2, playerXId: member });
  });

  it("registra desistência, permite editar regras com segurança e fechar a sala", async () => {
    const { id } = await create();
    await expect(
      changeGameRoom(member, communityId, id, {
        action: "UPDATE_RULES",
        rules: { version: 1, starterMode: "RANDOM" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    await changeGameRoom(admin, communityId, id, {
      action: "UPDATE_RULES",
      rules: { version: 1, starterMode: "RANDOM" },
    });
    let room = await start(id);
    const leaving = room.currentMatch!.playerXId;
    const winner = room.currentMatch!.playerOId;
    room = await changeGameRoom(leaving, communityId, id, { action: "LEAVE" });
    expect(room).toMatchObject({
      status: "WAITING",
      lastMatch: { outcome: "O_WON_FORFEIT", winnerId: winner },
    });
    expect(room.players.some((player) => player.userId === leaving)).toBe(false);
    await changeGameRoom(admin, communityId, id, { action: "CLOSE" });
    expect((await getGameRoom(owner, communityId, id)).status).toBe("CLOSED");
    await changeGameRoom(owner, communityId, id, { action: "REOPEN" });
    expect((await getGameRoom(owner, communityId, id)).status).toBe("WAITING");
  });

  it("encerra um tabuleiro completo sem vencedor como empate", async () => {
    const { id } = await create();
    let room = await start(id);
    const match = room.currentMatch!;
    const players = { X: match.playerXId, O: match.playerOId };
    for (const [mark, cell] of [
      ["X", 0],
      ["O", 1],
      ["X", 2],
      ["O", 4],
      ["X", 3],
      ["O", 5],
      ["X", 7],
      ["O", 6],
      ["X", 8],
    ] as const) {
      room = await playTicTacToeMove(players[mark], communityId, id, {
        matchId: match.id,
        cell,
      });
    }
    expect(room).toMatchObject({
      status: "WAITING",
      lastMatch: { outcome: "DRAW", winnerId: null, board: "XOXXOOOXX" },
    });
  });

  it("arquiva e oculta uma sala quando o último jogador sai", async () => {
    const { id } = await create();
    const room = await changeGameRoom(owner, communityId, id, { action: "LEAVE" });
    expect(room).toMatchObject({ status: "CLOSED", players: [] });
    expect((await listGameHub(owner, communityId)).rooms.some((item) => item.id === id)).toBe(
      false,
    );
  });

  it("classifica vitórias nos rankings semanal e mensal", async () => {
    const hub = await listGameHub(owner, communityId);
    const weeklyOwner = hub.leaderboards.week.entries.find((entry) => entry.userId === owner);
    const monthlyOwner = hub.leaderboards.month.entries.find((entry) => entry.userId === owner);
    expect(weeklyOwner?.wins).toBeGreaterThanOrEqual(1);
    expect(monthlyOwner?.wins).toBeGreaterThanOrEqual(1);
    expect(hub.rooms.every((room) => room.status !== "CLOSED")).toBe(true);
  });

  it("encerra por desistência antes da remoção administrativa do membro", async () => {
    const { id } = await create();
    const room = await start(id);
    const expectedWinner =
      room.currentMatch?.playerXId === member
        ? room.currentMatch.playerOId
        : room.currentMatch?.playerXId;
    await removeMember(owner, communityId, member);
    try {
      const updated = await getGameRoom(owner, communityId, id);
      expect(updated).toMatchObject({
        status: "WAITING",
        lastMatch: { winnerId: expectedWinner },
      });
      expect(updated.players.some((player) => player.userId === member)).toBe(false);
    } finally {
      await prisma.communityMember.create({ data: { communityId, userId: member } });
    }
  });
});
