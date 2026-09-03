import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { randomizerRequestSchema, saveRandomizerRunSchema } from "@/lib/validation/randomizer";
import { createCommunity } from "@/server/services/community-service";
import {
  deleteRandomizerRun,
  generateRandomizerResult,
  getRandomizerRun,
  getRandomizerSources,
  listSavedRandomizerRuns,
  saveRandomizerRun,
} from "@/server/services/randomizer-service";

describe.sequential("randomizer services", () => {
  const suffix = randomUUID();
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";
  let runId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-teste-123", 4);
    const [owner, member, outsider] = await Promise.all(
      ["owner", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            email: `${name}-${suffix}@randomizer.test`,
            name: `${name} original`,
            passwordHash,
          },
        }),
      ),
    );
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await createCommunity(ownerId, {
      name: `Sorteios ${suffix}`,
      description: null,
      avatarUrl: null,
    });
    communityId = community.id;
    await prisma.communityMember.create({ data: { communityId, userId: memberId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  it("usa membros como fonte e bloqueia pessoas externas", async () => {
    const event = await prisma.event.create({
      data: {
        communityId,
        createdById: ownerId,
        title: "Evento fonte",
        startsAt: new Date(Date.now() + 86_400_000),
        rsvps: {
          create: [
            { userId: ownerId, status: "GOING" },
            { userId: memberId, status: "MAYBE" },
          ],
        },
      },
    });
    const sources = await getRandomizerSources(ownerId, communityId);
    expect(sources.members.map((member) => member.id)).toEqual([ownerId, memberId]);
    expect(sources.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: event.id,
          participants: expect.arrayContaining([
            expect.objectContaining({ id: ownerId, status: "GOING" }),
            expect.objectContaining({ id: memberId, status: "MAYBE" }),
          ]),
        }),
      ]),
    );
    await expect(getRandomizerSources(outsiderId, communityId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("gera, salva e lista um resultado somente quando solicitado", async () => {
    const request = randomizerRequestSchema.parse({
      presetType: "TEAMS",
      participants: [
        { id: ownerId, label: "Owner original" },
        { id: memberId, label: "Member original" },
      ],
      configuration: { groupCount: 2, maxGroupSize: 1 },
      constraints: {},
    });
    const before = await listSavedRandomizerRuns(ownerId, communityId, { take: 20 });
    const result = await generateRandomizerResult(ownerId, communityId, request);
    expect(await listSavedRandomizerRuns(ownerId, communityId, { take: 20 })).toHaveLength(
      before.length,
    );

    const tamperedPayload = saveRandomizerRunSchema.parse({
      title: "Resultado adulterado",
      request,
      result: {
        kind: "GROUPS",
        groups: [
          {
            id: "group-1",
            label: "Time 1",
            members: [request.participants[0], request.participants[0]],
          },
        ],
      },
    });
    await expect(saveRandomizerRun(ownerId, communityId, tamperedPayload)).rejects.toMatchObject({
      code: "INVALID_RESULT",
    });

    const payload = saveRandomizerRunSchema.parse({
      title: "Times preservados",
      request,
      result,
    });
    const saved = await saveRandomizerRun(ownerId, communityId, payload);
    runId = saved.id;
    expect(await listSavedRandomizerRuns(memberId, communityId, { take: 20 })).toHaveLength(
      before.length + 1,
    );
  });

  it("preserva o snapshot e aplica autorização ao apagar", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { name: "Owner renomeado" } });
    const run = await getRandomizerRun(memberId, communityId, runId);
    expect(run.inputSnapshot).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Owner original" })]),
    );
    expect(run.canManage).toBe(false);
    await expect(deleteRandomizerRun(memberId, communityId, runId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getRandomizerRun(outsiderId, communityId, runId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await deleteRandomizerRun(ownerId, communityId, runId);
    await expect(getRandomizerRun(ownerId, communityId, runId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
