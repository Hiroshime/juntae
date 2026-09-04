import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createCostShare,
  createCostShareExpense,
  deleteCostShareExpense,
  getCostShare,
  setCostShareStatus,
  updateCostShare,
} from "@/server/services/cost-share-service";

describe("cost share services", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let firstMemberId = "";
  let secondMemberId = "";
  let outsiderId = "";
  let communityId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const users = await Promise.all(
      ["owner", "first", "second", "outsider"].map((kind) =>
        prisma.user.create({
          data: { email: `cost-${kind}-${suffix}@test.local`, name: kind, passwordHash },
        }),
      ),
    );
    [ownerId, firstMemberId, secondMemberId, outsiderId] = users.map((user) => user.id);
    const community = await prisma.community.create({
      data: {
        name: `Costs ${suffix}`,
        slug: `costs-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: firstMemberId },
            { userId: secondMemberId },
          ],
        },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.costShare.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, firstMemberId, secondMemberId, outsiderId] } },
    });
  });

  async function createBaseShare() {
    return createCostShare(ownerId, communityId, {
      title: "Churrasco",
      description: "Compras da viagem",
      currency: "BRL",
      eventId: null,
      participantIds: [ownerId, firstMemberId, secondMemberId],
    });
  }

  it("compensa compras feitas por várias pessoas", async () => {
    const share = await createBaseShare();
    await createCostShareExpense(firstMemberId, communityId, share.id, {
      description: "Carnes",
      amount: 90,
      payerId: firstMemberId,
      purchasedAt: "2026-09-04",
    });
    await createCostShareExpense(ownerId, communityId, share.id, {
      description: "Bebidas",
      amount: 60,
      payerId: ownerId,
      purchasedAt: "2026-09-04",
    });
    const detail = await getCostShare(secondMemberId, communityId, share.id);
    expect(detail.calculation.totalCents).toBe(15_000);
    expect(
      detail.calculation.balances.reduce((sum, balance) => sum + balance.balanceCents, 0),
    ).toBe(0);
    expect(
      detail.calculation.transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0),
    ).toBe(5_000);
  });

  it("limita lançamentos próprios e protege participantes com compras", async () => {
    const share = await createBaseShare();
    await expect(
      createCostShareExpense(firstMemberId, communityId, share.id, {
        description: "Compra alheia",
        amount: 10,
        payerId: secondMemberId,
        purchasedAt: "2026-09-04",
      }),
    ).rejects.toMatchObject({ status: 403 });
    const expense = await createCostShareExpense(firstMemberId, communityId, share.id, {
      description: "Pizza",
      amount: 75,
      payerId: firstMemberId,
      purchasedAt: "2026-09-04",
    });
    await expect(
      updateCostShare(ownerId, communityId, share.id, {
        title: "Churrasco",
        description: null,
        participantIds: [ownerId, secondMemberId],
      }),
    ).rejects.toMatchObject({ code: "PARTICIPANT_HAS_EXPENSES" });
    await deleteCostShareExpense(firstMemberId, communityId, share.id, expense.id);
    await expect(
      updateCostShare(ownerId, communityId, share.id, {
        title: "Churrasco",
        description: null,
        participantIds: [ownerId, secondMemberId],
      }),
    ).resolves.toMatchObject({ title: "Churrasco" });
  });

  it("fecha alterações e não expõe rateio fora da comunidade", async () => {
    const share = await createBaseShare();
    await setCostShareStatus(ownerId, communityId, share.id, "CLOSED");
    await expect(
      createCostShareExpense(ownerId, communityId, share.id, {
        description: "Depois do fechamento",
        amount: 10,
        payerId: ownerId,
        purchasedAt: "2026-09-04",
      }),
    ).rejects.toMatchObject({ code: "COST_SHARE_CLOSED" });
    await expect(getCostShare(outsiderId, communityId, share.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
