import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeSchema } from "@/lib/validation/challenge";
import {
  createChallenge,
  getChallenge,
  listChallenges,
  updateChallenge,
  changeChallengeParticipation,
} from "@/server/services/challenge-service";

describe("desafios privados", () => {
  const suffix = randomUUID();
  let communityId: string;
  let otherCommunityId: string;
  let owner: string;
  let creator: string;
  let member: string;
  let outsider: string;
  const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
  const input = challengeSchema.parse({
    title: "Movimento em grupo",
    rules: "Corridas e caminhadas contam para o desafio.",
    startDate: addCivilDays(today, 2),
    endDate: addCivilDays(today, 31),
    timezone: "America/Sao_Paulo",
    configuration: {
      version: 1,
      type: "FITNESS",
      scoring: { metric: "POINTS", pointsPerActivity: 10 },
    },
  });
  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "creator", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `challenge-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [owner, creator, member, outsider] = users.map((user) => user.id);
    const community = await prisma.community.create({
      data: {
        name: "Desafios",
        slug: `challenge-${suffix}`,
        createdById: owner,
        members: {
          create: [{ userId: owner, role: "OWNER" }, { userId: creator }, { userId: member }],
        },
      },
    });
    communityId = community.id;
    otherCommunityId = (
      await prisma.community.create({
        data: {
          name: "Outra",
          slug: `other-challenge-${suffix}`,
          createdById: outsider,
          members: { create: [{ userId: outsider, role: "OWNER" }, { userId: member }] },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.community.deleteMany({
      where: { id: { in: [communityId, otherCommunityId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner, creator, member, outsider].filter(Boolean) } },
    });
  });
  const create = () => createChallenge(creator, communityId, input);
  it("cria, consulta e edita como membro criador, sem inscrição automática", async () => {
    const { id } = await create();
    expect(await getChallenge(creator, communityId, id)).toMatchObject({
      state: "SCHEDULED",
      joined: false,
      canEdit: true,
      participantCount: 0,
    });
    await updateChallenge(creator, communityId, id, { ...input, title: "Novo título" });
    await updateChallenge(owner, communityId, id, { ...input, title: "Ajustado pelo admin" });
    const result = await getChallenge(member, communityId, id);
    expect(result.title).toBe("Ajustado pelo admin");
    expect(result.canEdit).toBe(false);
    expect(JSON.stringify(result)).not.toContain("@test.local");
  });
  it("nega não membros, ações administrativas e IDs de outra comunidade", async () => {
    const { id } = await create();
    await expect(createChallenge(outsider, communityId, input)).rejects.toMatchObject({
      status: 404,
    });
    await expect(listChallenges(outsider, communityId)).rejects.toMatchObject({ status: 404 });
    await expect(getChallenge(outsider, communityId, id)).rejects.toMatchObject({ status: 404 });
    await expect(getChallenge(member, otherCommunityId, id)).rejects.toMatchObject({ status: 404 });
    await expect(
      changeChallengeParticipation(member, otherCommunityId, id, "JOIN"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      changeChallengeParticipation(outsider, communityId, id, "JOIN"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(updateChallenge(member, communityId, id, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      changeChallengeParticipation(member, communityId, id, "CANCEL"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("inscrição idempotente, saída e reentrada sem desbloquear regras", async () => {
    const { id } = await create();
    await Promise.all(
      [1, 2].map(() => changeChallengeParticipation(member, communityId, id, "JOIN")),
    );
    expect(await getChallenge(member, communityId, id)).toMatchObject({
      joined: true,
      participantCount: 1,
    });
    await changeChallengeParticipation(member, communityId, id, "LEAVE");
    expect(await getChallenge(member, communityId, id)).toMatchObject({
      joined: false,
      participantCount: 0,
    });
    await expect(updateChallenge(creator, communityId, id, input)).rejects.toMatchObject({
      status: 409,
    });
    await changeChallengeParticipation(member, communityId, id, "JOIN");
    expect(await prisma.challengeParticipant.count({ where: { challengeId: id } })).toBe(1);
  });
  it("preserva bloqueio após remover membro e revoga seu acesso", async () => {
    const { id } = await create();
    await changeChallengeParticipation(member, communityId, id, "JOIN");
    await prisma.communityMember.delete({
      where: { communityId_userId: { communityId, userId: member } },
    });
    try {
      expect(await getChallenge(creator, communityId, id)).toMatchObject({
        participantCount: 0,
        canEdit: false,
      });
      await expect(getChallenge(member, communityId, id)).rejects.toMatchObject({ status: 404 });
      await expect(updateChallenge(creator, communityId, id, input)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      await prisma.communityMember.create({ data: { communityId, userId: member } });
    }
  });
  it("cancela preservando participantes e bloqueia ações posteriores", async () => {
    const { id } = await create();
    await changeChallengeParticipation(member, communityId, id, "JOIN");
    await changeChallengeParticipation(owner, communityId, id, "CANCEL");
    expect(await getChallenge(member, communityId, id)).toMatchObject({
      state: "CANCELLED",
      participantCount: 1,
      canParticipate: false,
    });
    for (const action of ["JOIN", "LEAVE"] as const)
      await expect(
        changeChallengeParticipation(member, communityId, id, action),
      ).rejects.toMatchObject({ status: 409 });
    await expect(updateChallenge(creator, communityId, id, input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("recusa início passado, aceita hoje e encerra automaticamente após o último dia", async () => {
    await expect(
      createChallenge(creator, communityId, { ...input, startDate: addCivilDays(today, -1) }),
    ).rejects.toMatchObject({ status: 400 });
    const { id } = await createChallenge(creator, communityId, {
      ...input,
      startDate: today,
      endDate: today,
    });
    expect(await getChallenge(creator, communityId, id)).toMatchObject({
      state: "ACTIVE",
      canEdit: false,
    });
    await expect(updateChallenge(creator, communityId, id, input)).rejects.toMatchObject({
      status: 409,
    });
    await changeChallengeParticipation(member, communityId, id, "JOIN");
    await prisma.challenge.update({
      where: { id },
      data: {
        startDate: new Date(addCivilDays(today, -2)),
        endDate: new Date(addCivilDays(today, -1)),
      },
    });
    expect(await getChallenge(creator, communityId, id)).toMatchObject({
      state: "ENDED",
      canParticipate: false,
      canCancel: false,
    });
    await expect(
      changeChallengeParticipation(owner, communityId, id, "CANCEL"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      changeChallengeParticipation(creator, communityId, id, "JOIN"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("coordena inscrição com edição e cancelamento concorrentes", async () => {
    const { id } = await create();
    const results = await Promise.allSettled([
      updateChallenge(creator, communityId, id, { ...input, title: "Mudança concorrente" }),
      changeChallengeParticipation(member, communityId, id, "JOIN"),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect(await getChallenge(creator, communityId, id)).toMatchObject({
      canEdit: false,
      participantCount: 1,
    });
    if (results[0].status === "rejected") expect(results[0].reason).toMatchObject({ status: 409 });
    await Promise.allSettled([
      changeChallengeParticipation(creator, communityId, id, "JOIN"),
      changeChallengeParticipation(owner, communityId, id, "CANCEL"),
    ]);
    expect(await getChallenge(member, communityId, id)).toMatchObject({ state: "CANCELLED" });
  });
  it("pagina resultados sem perder desafios", async () => {
    await prisma.challenge.createMany({
      data: Array.from({ length: 21 }, (_, i) => ({
        communityId: otherCommunityId,
        createdById: outsider,
        title: `Desafio ${i}`,
        rules: input.rules,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        timezone: input.timezone,
        configuration: input.configuration,
      })),
    });
    const first = await listChallenges(member, otherCommunityId);
    const second = await listChallenges(member, otherCommunityId, 2);
    expect(first.items).toHaveLength(20);
    expect(first.hasNext).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasNext).toBe(false);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(21);
  });
});
