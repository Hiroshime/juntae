import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  finishBellHopRun,
  listBellHopLeaderboards,
  startBellHopRun,
} from "@/server/services/bell-hop-service";

describe("arcade Salto dos Sinos", () => {
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
            email: `bell-hop-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "Arcade",
          slug: `arcade-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER", displayName: "Coelho Azul" },
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
    await prisma.bellHopRun.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - seconds * 1_000) },
    });
  }

  it("mantém o jogo privado e abandona a tentativa anterior ao reiniciar", async () => {
    await expect(startBellHopRun(outsiderId, communityId)).rejects.toMatchObject({ status: 404 });
    const first = await startBellHopRun(ownerId, communityId);
    const second = await startBellHopRun(ownerId, communityId);
    expect(second.seed).toBeGreaterThan(0);
    expect(await prisma.bellHopRun.findUnique({ where: { id: first.id } })).toMatchObject({
      status: "ABANDONED",
    });
    expect(
      await prisma.bellHopRun.count({ where: { communityId, userId: ownerId, status: "ACTIVE" } }),
    ).toBe(1);
  });

  it("recalcula a pontuação, encerra uma única vez e bloqueia métricas impossíveis", async () => {
    const cheating = await startBellHopRun(memberId, communityId);
    await expect(
      finishBellHopRun(memberId, communityId, cheating.id, {
        bellsHit: 100,
        maxHeight: 1_000,
        durationMs: 100,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const run = await startBellHopRun(ownerId, communityId);
    await ageRun(run.id);
    const result = await finishBellHopRun(ownerId, communityId, run.id, {
      bellsHit: 3,
      maxHeight: 390,
      durationMs: 5_000,
    });
    expect(result).toMatchObject({ score: 60, bellsHit: 3, maxHeight: 390 });
    await expect(
      finishBellHopRun(ownerId, communityId, run.id, {
        bellsHit: 3,
        maxHeight: 390,
        durationMs: 5_000,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      finishBellHopRun(memberId, communityId, run.id, {
        bellsHit: 3,
        maxHeight: 390,
        durationMs: 5_000,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("classifica o melhor resultado de cada membro por semana e mês", async () => {
    const memberRun = await startBellHopRun(memberId, communityId);
    await ageRun(memberRun.id);
    await finishBellHopRun(memberId, communityId, memberRun.id, {
      bellsHit: 4,
      maxHeight: 510,
      durationMs: 6_000,
    });
    const ranking = await listBellHopLeaderboards(ownerId, communityId);
    expect(ranking.week.entries[0]).toMatchObject({
      userId: memberId,
      rank: 1,
      score: 100,
    });
    expect(ranking.week.entries.find((entry) => entry.userId === ownerId)).toMatchObject({
      name: "Coelho Azul",
      score: 60,
    });
    expect(ranking.month.entries[0]?.userId).toBe(memberId);
  });
});
