import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  castVote,
  closePoll,
  createPoll,
  getPoll,
  listPolls,
  removeVote,
  updatePoll,
} from "@/server/services/poll-service";

describe("poll services", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  const simpleInput = {
    title: "Onde vamos?",
    description: null,
    type: "SINGLE_CHOICE" as const,
    allowVoteChange: true,
    closesAt: null,
    options: ["Parque", "Cinema", "Restaurante"],
  };

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, admin, member, outsider] = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((kind) =>
        prisma.user.create({
          data: {
            email: `poll-${kind}-${suffix}@test.local`,
            name: `Poll ${kind}`,
            passwordHash,
          },
        }),
      ),
    );
    ownerId = owner.id;
    adminId = admin.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await prisma.community.create({
      data: {
        name: `Polls ${suffix}`,
        slug: `polls-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: adminId, role: "ADMIN" },
            { userId: memberId, role: "MEMBER", displayName: "Nome na votação" },
          ],
        },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.poll.deleteMany({ where: { communityId } });
    await prisma.availabilityOverride.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId] } },
    });
  });

  it("permite que qualquer membro crie e liste os três tipos", async () => {
    await createPoll(memberId, communityId, simpleInput);
    await createPoll(memberId, communityId, {
      ...simpleInput,
      title: "O que fazer?",
      type: "MULTIPLE_CHOICE",
    });
    await createPoll(memberId, communityId, {
      title: "Quando vamos?",
      description: null,
      type: "DATE_OPTIONS",
      timezone: "America/Sao_Paulo",
      allowVoteChange: true,
      closesAt: null,
      dates: ["2030-09-10", "2030-09-11"],
    });
    const polls = await listPolls(ownerId, communityId, { scope: "OPEN", take: 10 });
    expect(polls).toHaveLength(3);
    expect(new Set(polls.map((poll) => poll.type))).toEqual(
      new Set(["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DATE_OPTIONS"]),
    );
  });

  it("substitui atomicamente o voto de escolha única", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await castVote(memberId, communityId, poll.id, [poll.options[1].id]);
    const detail = await getPoll(memberId, communityId, poll.id);
    expect(detail.myOptionIds).toEqual([poll.options[1].id]);
    expect(detail.totalVoters).toBe(1);
    expect(await prisma.pollVote.count({ where: { pollId: poll.id, userId: memberId } })).toBe(1);
  });

  it("persiste múltiplas opções e permite remover o voto", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      type: "MULTIPLE_CHOICE",
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id, poll.options[2].id]);
    expect((await getPoll(memberId, communityId, poll.id)).myOptionIds).toHaveLength(2);
    await removeVote(memberId, communityId, poll.id);
    expect((await getPoll(memberId, communityId, poll.id)).myOptionIds).toEqual([]);
  });

  it("impede alteração quando configurado, mas mantém reenvio idempotente", async () => {
    const poll = await createPoll(ownerId, communityId, {
      ...simpleInput,
      allowVoteChange: false,
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id]);
    await expect(castVote(memberId, communityId, poll.id, [poll.options[0].id])).resolves.toEqual({
      optionIds: [poll.options[0].id],
    });
    await expect(
      castVote(memberId, communityId, poll.id, [poll.options[1].id]),
    ).rejects.toMatchObject({ code: "VOTE_CHANGE_NOT_ALLOWED" });
    await expect(removeVote(memberId, communityId, poll.id)).rejects.toMatchObject({
      code: "VOTE_CHANGE_NOT_ALLOWED",
    });
  });

  it("não aceita voto encerrado por status ou prazo", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await closePoll(ownerId, communityId, poll.id);
    await expect(
      castVote(memberId, communityId, poll.id, [poll.options[0].id]),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });

    const expired = await createPoll(ownerId, communityId, {
      ...simpleInput,
      title: "Prazo expirado",
    });
    await prisma.poll.update({
      where: { id: expired.id },
      data: { closesAt: new Date(Date.now() + 1_000) },
    });
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(
      castVote(memberId, communityId, expired.id, [expired.options[0].id]),
    ).rejects.toMatchObject({ code: "POLL_CLOSED" });
  });

  it("protege acesso e moderação por membership e papel", async () => {
    const poll = await createPoll(ownerId, communityId, simpleInput);
    await expect(getPoll(outsiderId, communityId, poll.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      updatePoll(memberId, communityId, poll.id, {
        title: "Sem permissão",
        description: null,
        allowVoteChange: true,
        closesAt: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updatePoll(adminId, communityId, poll.id, {
        title: "Moderada pelo admin",
        description: null,
        allowVoteChange: true,
        closesAt: null,
      }),
    ).resolves.toMatchObject({ title: "Moderada pelo admin" });
  });

  it("exibe votos e disponibilidade separadamente em opções de data", async () => {
    await prisma.availabilityOverride.create({
      data: {
        communityId,
        userId: memberId,
        startAt: new Date("2030-09-10T03:00:00.000Z"),
        endAt: new Date("2030-09-11T03:00:00.000Z"),
        allDay: true,
        status: "AVAILABLE",
      },
    });
    const poll = await createPoll(ownerId, communityId, {
      title: "Melhor data",
      description: null,
      type: "DATE_OPTIONS",
      timezone: "America/Sao_Paulo",
      allowVoteChange: true,
      closesAt: null,
      dates: ["2030-09-10", "2030-09-11"],
    });
    await castVote(memberId, communityId, poll.id, [poll.options[0].id, poll.options[1].id]);
    const detail = await getPoll(ownerId, communityId, poll.id);
    expect(detail.options[0]).toMatchObject({
      voteCount: 1,
      availability: { fullAvailableCount: 1, unknownCount: 2, score: 1 },
    });
    expect(detail.options[0].voters[0].name).toBe("Nome na votação");
  });
});
