import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  finishTowerStackRun,
  listTowerStackLeaderboards,
  startTowerStackRun,
} from "@/server/services/tower-stack-service";

describe("arcade Torre em Equilíbrio", () => {
  const suffix = randomUUID();
  let communityId: string;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `tower-stack-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Torres",
          slug: `torres-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER", displayName: "Arquiteta" },
              { userId: memberId, role: "MEMBER" },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  async function ageRun(id: string, seconds = 10) {
    await prisma.towerStackRun.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - seconds * 1_000) },
    });
  }

  it("isola a comunidade e abandona a tentativa anterior ao reiniciar", async () => {
    await expect(startTowerStackRun(outsiderId, communityId)).rejects.toMatchObject({
      status: 404,
    });
    const first = await startTowerStackRun(ownerId, communityId);
    const second = await startTowerStackRun(ownerId, communityId);
    expect(second.seed).toBeGreaterThan(0);
    expect(await prisma.towerStackRun.findUnique({ where: { id: first.id } })).toMatchObject({
      status: "ABANDONED",
    });
    expect(
      await prisma.towerStackRun.count({
        where: { communityId, userId: ownerId, status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("recalcula placar e altura e rejeita resultado impossível", async () => {
    const cheating = await startTowerStackRun(memberId, communityId);
    await expect(
      finishTowerStackRun(memberId, communityId, cheating.id, {
        blocksPlaced: 100,
        livesRemaining: 0,
        durationMs: 100,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const run = await startTowerStackRun(ownerId, communityId);
    await ageRun(run.id);
    const result = await finishTowerStackRun(ownerId, communityId, run.id, {
      blocksPlaced: 3,
      livesRemaining: 0,
      durationMs: 5_000,
    });
    expect(result).toMatchObject({
      score: 150,
      blocksPlaced: 3,
      maxHeight: 156,
      livesRemaining: 0,
    });
    await expect(
      finishTowerStackRun(ownerId, communityId, run.id, {
        blocksPlaced: 3,
        livesRemaining: 0,
        durationMs: 5_000,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      finishTowerStackRun(memberId, communityId, run.id, {
        blocksPlaced: 3,
        livesRemaining: 0,
        durationMs: 5_000,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("classifica o melhor resultado por membro na semana e no mês", async () => {
    const run = await startTowerStackRun(memberId, communityId);
    await ageRun(run.id);
    await finishTowerStackRun(memberId, communityId, run.id, {
      blocksPlaced: 4,
      livesRemaining: 0,
      durationMs: 6_000,
    });
    const ranking = await listTowerStackLeaderboards(ownerId, communityId);
    expect(ranking.week.entries[0]).toMatchObject({
      userId: memberId,
      rank: 1,
      score: 250,
      blocksPlaced: 4,
    });
    expect(ranking.week.entries.find((entry) => entry.userId === ownerId)).toMatchObject({
      name: "Arquiteta",
      score: 150,
    });
    expect(ranking.month.entries[0]?.userId).toBe(memberId);
  });
});
