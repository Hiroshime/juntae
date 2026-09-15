import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { changeEventAccount, getEventAccount } from "@/server/services/event-account-service";
import {
  createCostShare,
  createCostShareExpense,
  updateCostShareExpense,
} from "@/server/services/cost-share-service";
import { createEvent, setEventRsvp, updateEvent } from "@/server/services/event-service";
import { eventSchema } from "@/lib/validation/event";

describe("controle financeiro de eventos", () => {
  const suffix = randomUUID();
  let communityId: string;
  let creator: string;
  let owner: string;
  let member: string;
  let outsider: string;
  let eventId: string;
  const eventInput = eventSchema.parse({
    title: "Chácara",
    description: null,
    startsAt: "2026-11-20T12:00:00Z",
    endsAt: "2026-11-23T23:00:00Z",
    timezone: "America/Sao_Paulo",
    locationName: null,
    locationAddress: null,
    locationUrl: null,
    estimatedCost: 900,
    currency: "BRL",
    allowPartialAttendance: true,
  });
  beforeAll(async () => {
    const users = await Promise.all(
      ["creator", "owner", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `account-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [creator, owner, member, outsider] = users.map((user) => user.id);
    const community = await prisma.community.create({
      data: {
        name: "Acerto",
        slug: `account-${suffix}`,
        createdById: owner,
        members: {
          create: [{ userId: owner, role: "OWNER" }, { userId: creator }, { userId: member }],
        },
      },
    });
    communityId = community.id;
  });
  beforeEach(async () => {
    const event = await createEvent(creator, communityId, eventInput);
    eventId = event.id;
    for (const id of [creator, owner, member])
      await setEventRsvp(id, communityId, eventId, { status: "GOING", attendanceDates: null });
  });
  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [creator, owner, member, outsider].filter(Boolean) } },
    });
  });
  const view = () => getEventAccount(creator, communityId, eventId);
  const act = (action: Parameters<typeof changeEventAccount>[3], actor = creator) =>
    changeEventAccount(actor, communityId, eventId, action);
  async function enable() {
    await act({ action: "ENABLE" });
  }
  async function pay(
    userId: string,
    amountCents: number,
    direction: "RECEIVED" | "REFUNDED" = "RECEIVED",
  ) {
    return act({
      action: "PAYMENT",
      userId,
      amountCents,
      direction,
      note: "Acerto",
      revision: (await view()).revision,
    });
  }
  async function share(amount: number, payerId: string) {
    const cost = await createCostShare(creator, communityId, {
      title: "Compras",
      description: null,
      currency: "BRL",
      eventId,
      participantIds: [creator, owner, member],
    });
    const expense = await createCostShareExpense(creator, communityId, cost.id, {
      description: "Carnes",
      amount,
      payerId,
      purchasedAt: "2026-11-20",
    });
    return { cost, expense };
  }
  it("começa opcional e restringe mutações ao criador do evento e administradores", async () => {
    expect(await view()).toMatchObject({ enabled: false, summary: null });
    await expect(act({ action: "ENABLE" }, member)).rejects.toMatchObject({ status: 403 });
    await expect(getEventAccount(outsider, communityId, eventId)).rejects.toMatchObject({
      status: 404,
    });
    await act({ action: "ENABLE" }, owner);
    expect(await getEventAccount(member, communityId, eventId)).toMatchObject({
      enabled: true,
      canManage: false,
    });
    await expect(
      act({ action: "CLOSE", revision: (await view()).revision }, member),
    ).rejects.toMatchObject({ status: 403 });
    await act({ action: "DISABLE" });
    expect((await view()).enabled).toBe(false);
  });
  it("consolida rateios, parcelas, reembolsos e fecha somente com saldos zerados", async () => {
    await share(450, creator);
    await share(150, owner);
    await enable();
    expect((await view()).summary?.totalCents).toBe(150_000);
    expect((await view()).summary?.people.find((p) => p.id === creator)?.dueCents).toBe(5_000);
    await expect(act({ action: "CLOSE", revision: (await view()).revision })).rejects.toMatchObject(
      { code: "ACCOUNT_PENDING" },
    );
    await pay(member, 10_000);
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(40_000);
    await pay(member, 40_000);
    await pay(owner, 35_000);
    await pay(creator, 5_000);
    await act({ action: "CLOSE", revision: (await view()).revision });
    const closed = await view();
    expect(closed.closedAt).not.toBeNull();
    await expect(act({ action: "VOID", paymentId: closed.payments[0].id })).rejects.toMatchObject({
      code: "ACCOUNT_CLOSED",
    });
    // Later edits never silently rewrite an agreed, closed account.
    await updateEvent(creator, communityId, eventId, { ...eventInput, estimatedCost: 1200 });
    expect((await view()).summary).toEqual(closed.summary);
    await act({ action: "REOPEN" });
    expect((await view()).summary?.pendingCents).toBe(30_000);
    expect((await view()).payments).toHaveLength(4);
  });
  it("não cobra duas vezes quem comprou e guarda auditoria de anulações", async () => {
    await share(1500, creator);
    await enable();
    const account = await view();
    expect(account.summary?.people.find((p) => p.id === creator)?.dueCents).toBe(-70_000);
    await expect(pay(creator, 70_001, "REFUNDED")).rejects.toMatchObject({
      code: "INVALID_PAYMENT",
    });
    await pay(creator, 70_000, "REFUNDED");
    const entry = (await view()).payments[0];
    await act({ action: "VOID", paymentId: entry.id }, owner);
    expect((await view()).payments[0]).toMatchObject({ recordedBy: "creator", voidedBy: "owner" });
    expect((await view()).summary?.refundableCents).toBe(70_000);
    await expect(act({ action: "DISABLE" })).rejects.toMatchObject({
      code: "ACCOUNT_HAS_PAYMENTS",
    });
    await expect(
      updateEvent(creator, communityId, eventId, { ...eventInput, currency: "USD" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_HAS_PAYMENTS" });
  });
  it("aceita parcelas antecipadas, limita reembolsos e serializa duplicação concorrente", async () => {
    await enable();
    await pay(member, 30_001);
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(-1);
    await pay(member, 10_000);
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(-10_001);
    await expect(pay(member, 10_002, "REFUNDED")).rejects.toMatchObject({
      code: "INVALID_PAYMENT",
    });
    await pay(member, 10_001, "REFUNDED");
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(0);
    await expect(pay(outsider, 100)).rejects.toMatchObject({ status: 404 });
    const input = {
      action: "PAYMENT" as const,
      userId: member,
      amountCents: 30_000,
      direction: "RECEIVED" as const,
      note: "",
      revision: (await view()).revision,
    };
    const results = await Promise.allSettled([act(input), act(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await view()).payments).toHaveLength(4);
    await expect(act(input)).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
  });
  it("atualiza compras e preserva pagamentos de quem deixou de confirmar", async () => {
    const { cost, expense } = await share(60, creator);
    await enable();
    await pay(member, 32_000);
    await updateCostShareExpense(creator, communityId, cost.id, expense.id, {
      description: "Carnes",
      amount: 90,
      payerId: creator,
      purchasedAt: "2026-11-20",
    });
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(1000);
    await setEventRsvp(member, communityId, eventId, {
      status: "NOT_GOING",
      attendanceDates: null,
    });
    expect((await view()).summary?.people.find((p) => p.id === member)?.dueCents).toBe(-29_000);
  });
  it("impede pagamentos se um rateio tem moeda diferente e isola eventos", async () => {
    const { cost } = await share(50, creator);
    await prisma.costShare.update({ where: { id: cost.id }, data: { currency: "USD" } });
    await enable();
    expect((await view()).issues[0]).toContain("USD");
    await expect(pay(member, 100)).rejects.toMatchObject({ code: "ACCOUNT_INVALID" });
    const other = await createEvent(creator, communityId, eventInput);
    expect((await getEventAccount(creator, communityId, other.id)).enabled).toBe(false);
    await expect(act({ action: "VOID", paymentId: randomUUID() })).rejects.toMatchObject({
      status: 404,
    });
  });
});
