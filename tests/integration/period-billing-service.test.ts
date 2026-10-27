import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { eventSchema } from "@/lib/validation/event";
import { createEvent, getEvent, setEventRsvp, updateEvent } from "@/server/services/event-service";
import { changeEventAccount, getEventAccount } from "@/server/services/event-account-service";
import {
  createCostShare,
  createCostShareExpense,
  getCostShare,
  getCostShareSources,
  setCostShareStatus,
  updateCostShare,
  updateCostShareExpense,
} from "@/server/services/cost-share-service";

describe("cobrança por períodos", () => {
  let communityId = "",
    a = "",
    b = "",
    c = "",
    visitor = "",
    outsider = "",
    eventId = "";
  const suffix = randomUUID();
  const input = eventSchema.parse({
    title: "Chácara por noites",
    description: "",
    startsAt: "2026-11-20T18:00:00Z",
    endsAt: "2026-11-22T15:00:00Z",
    timezone: "America/Sao_Paulo",
    allDay: false,
    estimatedCost: 1200,
    billingMode: "NIGHT",
    currency: "BRL",
    locationName: "",
    locationAddress: "",
    locationUrl: "",
    allowPartialAttendance: true,
  });
  beforeAll(async () => {
    const users = await Promise.all(
      ["Luiz", "Kelvin", "Urias", "Visitante", "Externo"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `period-${name.toLowerCase()}-${suffix}@test.local`,
            passwordHash: "unused",
          },
        }),
      ),
    );
    [a, b, c, visitor, outsider] = users.map((user) => user.id);
    const community = await prisma.community.create({
      data: {
        name: "Diárias",
        slug: `period-${suffix}`,
        createdById: a,
        members: {
          create: [{ userId: a, role: "OWNER" }, { userId: b }, { userId: c }, { userId: visitor }],
        },
      },
    });
    communityId = community.id;
  });
  beforeEach(async () => {
    eventId = (await createEvent(a, communityId, input)).id;
    for (const userId of [a, b])
      await setEventRsvp(userId, communityId, eventId, { status: "GOING", attendanceDates: null });
    await setEventRsvp(c, communityId, eventId, {
      status: "GOING",
      attendanceDates: ["2026-11-20"],
    });
    await setEventRsvp(visitor, communityId, eventId, {
      status: "GOING",
      attendanceDates: ["2026-11-21"],
    });
  });
  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [a, b, c, visitor, outsider].filter(Boolean) } },
    });
  });
  const view = () => getEventAccount(a, communityId, eventId);
  const periods = () => [
    { date: "2026-11-20", userIds: [a, b, c] },
    { date: "2026-11-21", userIds: [a, b] },
  ];
  async function configure() {
    await changeEventAccount(a, communityId, eventId, {
      action: "CONFIGURE",
      mode: "NIGHT",
      periods: periods(),
      revision: (await view()).revision,
    });
  }
  const enable = () => changeEventAccount(a, communityId, eventId, { action: "ENABLE" });
  async function pay(
    userId: string,
    amountCents: number,
    direction: "RECEIVED" | "REFUNDED" = "RECEIVED",
  ) {
    await changeEventAccount(a, communityId, eventId, {
      action: "PAYMENT",
      userId,
      amountCents,
      direction,
      note: "",
      revision: (await view()).revision,
    });
  }
  const row = (account: Awaited<ReturnType<typeof view>>, id: string) =>
    account.summary!.people.find((person) => person.id === id)!;
  async function share(
    type: "SELECTED" | "EVENT" | "DAY",
    participantIds: string[] = [],
    date?: string,
  ) {
    return createCostShare(a, communityId, {
      title: "Compras do passeio",
      description: null,
      currency: "BRL",
      eventId,
      participantIds,
      allocationType: type,
      allocationDate: date || null,
    });
  }
  async function expense(costShareId: string, payerId: string, amount: number, actor = a) {
    return createCostShareExpense(actor, communityId, costShareId, {
      payerId,
      description: "Compra",
      amount,
      purchasedAt: "2026-11-20",
    });
  }

  it("exige revisão de pernoites, calcula 500/500/200 e deixa visitante sem hospedagem", async () => {
    expect((await view()).billing.issues.join(" ")).toContain("presença parcial");
    await enable();
    await expect(pay(a, 100)).rejects.toMatchObject({ code: "ACCOUNT_INVALID" });
    await configure();
    const account = await view();
    expect(account.issues).toEqual([]);
    expect([a, b, c, visitor].map((id) => row(account, id).eventShareCents)).toEqual([
      50000, 50000, 20000, 0,
    ]);
    expect(account.summary?.totalCents).toBe(120000);
    expect(
      await prisma.eventRsvp.findUnique({
        where: { eventId_userId: { eventId, userId: visitor } },
        include: { attendanceDays: true },
      }),
    ).toMatchObject({
      attendingSpecificDays: true,
      attendanceDays: [{ date: new Date("2026-11-21") }],
    });
    expect(account.summary?.periods.map((period) => period.amountCents)).toEqual([60000, 60000]);
    expect((await getEvent(b, communityId, eventId)).estimatedCostPerConfirmed).toBeNull();
  });
  it("sugere os presentes em cada dia e calcula diárias com presença parcial", async () => {
    await updateEvent(a, communityId, eventId, {
      ...input,
      billingMode: "DAY",
      estimatedCost: 900,
    });
    await enable();
    const account = await view();
    expect([a, b, c, visitor].map((id) => row(account, id).eventShareCents)).toEqual([
      35000, 35000, 10000, 10000,
    ]);
    const source = (await getCostShareSources(a, communityId)).events.find(
      (event) => event.id === eventId,
    )!;
    expect(new Set(source.days.find((day) => day.date === "2026-11-21")!.participantIds)).toEqual(
      new Set([a, b, visitor]),
    );
  });
  it("aplica evento inteiro e credita comprador fora dos beneficiários, inclusive compra própria", async () => {
    await configure();
    await enable();
    const cost = await share("EVENT");
    const purchase = await expense(cost.id, visitor, 300, visitor);
    let detail = await getCostShare(visitor, communityId, cost.id);
    expect(detail.currentUserIsParticipant).toBe(false);
    expect(detail.canAddExpense).toBe(true);
    expect(detail.calculation.balances.find((person) => person.id === visitor)).toMatchObject({
      shareCents: 0,
      paidCents: 30000,
      balanceCents: 30000,
    });
    let account = await view();
    expect([a, b, c].map((id) => row(account, id).costSharesCents)).toEqual([12500, 12500, 5000]);
    expect(row(account, visitor).dueCents).toBe(-30000);
    expect(account.summary!.people.reduce((sum, person) => sum + person.dueCents, 0)).toBe(120000);
    await updateCostShareExpense(visitor, communityId, cost.id, purchase.id, {
      payerId: visitor,
      description: "Compra corrigida",
      amount: 600,
      purchasedAt: "2026-11-20",
    });
    detail = await getCostShare(visitor, communityId, cost.id);
    expect(detail.calculation.totalCents).toBe(60000);
    account = await view();
    expect(row(account, visitor).dueCents).toBe(-60000);
  });
  it("divide dia específico entre a lista própria e permite seleção de uma pessoa", async () => {
    await configure();
    await enable();
    const lunch = await share("DAY", [a, b, visitor], "2026-11-21");
    await expense(lunch.id, c, 90, c);
    const manual = await share("SELECTED", [visitor]);
    await expense(manual.id, a, 80);
    const account = await view();
    expect([a, b, c, visitor].map((id) => row(account, id).costSharesCents)).toEqual([
      3000, 3000, 0, 11000,
    ]);
    expect(row(account, c).purchasesCents).toBe(9000);
    expect(row(account, a).purchasesCents).toBe(8000);
    await setEventRsvp(visitor, communityId, eventId, {
      status: "NOT_GOING",
      attendanceDates: null,
    });
    expect((await getCostShare(a, communityId, lunch.id)).participants.map((p) => p.id)).toContain(
      visitor,
    );
  });
  it("rejeita períodos/dias/pessoas inválidos, tentativas de terceiros e compras alheias", async () => {
    const action = {
      action: "CONFIGURE" as const,
      mode: "NIGHT" as const,
      periods: periods(),
      revision: (await view()).revision,
    };
    await expect(changeEventAccount(b, communityId, eventId, action)).rejects.toMatchObject({
      status: 403,
    });
    await expect(changeEventAccount(outsider, communityId, eventId, action)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      changeEventAccount(a, communityId, eventId, {
        ...action,
        periods: [{ date: "2030-01-01", userIds: [a] }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_BILLING_PERIODS" });
    await expect(
      changeEventAccount(a, communityId, eventId, {
        ...action,
        periods: action.periods.map((period) => ({ ...period, userIds: [outsider] })),
      }),
    ).rejects.toMatchObject({ code: "INVALID_BILLING_PARTICIPANTS" });
    await expect(share("DAY", [a], "2030-01-01")).rejects.toMatchObject({
      code: "INVALID_ALLOCATION_DATE",
    });
    const manual = await share("SELECTED", [a]);
    await expect(expense(manual.id, b, 20, c)).rejects.toMatchObject({ status: 403 });
    await expect(expense(manual.id, outsider, 20)).rejects.toMatchObject({ code: "INVALID_PAYER" });
    await expect(
      updateCostShare(b, communityId, manual.id, {
        title: "Ataque",
        description: null,
        participantIds: [b],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      createCostShare(a, communityId, {
        title: "Sem evento",
        description: null,
        currency: "BRL",
        eventId: null,
        participantIds: [a],
        allocationType: "EVENT",
      }),
    ).rejects.toMatchObject({ code: "EVENT_REQUIRED" });
  });
  it("mantém custo de período vazio pendente e rejeita revisões antigas", async () => {
    await configure();
    await enable();
    await changeEventAccount(a, communityId, eventId, {
      action: "CONFIGURE",
      mode: "NIGHT",
      periods: [periods()[0], { date: "2026-11-21", userIds: [] }],
      revision: (await view()).revision,
    });
    expect((await view()).summary?.unallocatedCents).toBe(60000);
    await expect(pay(a, 100)).rejects.toMatchObject({ code: "ACCOUNT_INVALID" });
    await expect(
      changeEventAccount(a, communityId, eventId, {
        action: "CLOSE",
        revision: (await view()).revision,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_INVALID" });
    const stale = (await view()).revision;
    await setEventRsvp(visitor, communityId, eventId, {
      status: "NOT_GOING",
      attendanceDates: null,
    });
    await expect(
      changeEventAccount(a, communityId, eventId, {
        action: "CONFIGURE",
        mode: "NIGHT",
        periods: periods(),
        revision: stale,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
    await configure();
    expect((await view()).issues).toEqual([]);
  });
  it("detecta saída de confirmado e alteração de datas, preservando pagamentos", async () => {
    await configure();
    await enable();
    await pay(a, 10000);
    await setEventRsvp(b, communityId, eventId, { status: "NOT_GOING", attendanceDates: null });
    expect((await view()).issues.join(" ")).toContain("não estão mais confirmadas");
    await expect(pay(a, 100)).rejects.toMatchObject({ code: "ACCOUNT_INVALID" });
    await setEventRsvp(b, communityId, eventId, { status: "GOING", attendanceDates: null });
    await updateEvent(a, communityId, eventId, { ...input, endsAt: "2026-11-23T15:00:00Z" });
    expect((await view()).billing.issues.join(" ")).toContain("datas do evento mudaram");
    expect((await view()).payments).toHaveLength(1);
  });
  it("congela rateios fechados e recalcula somente ao reabrir", async () => {
    await configure();
    await enable();
    const cost = await share("EVENT");
    await expense(cost.id, visitor, 300);
    await setCostShareStatus(a, communityId, cost.id, "CLOSED");
    const before = await getCostShare(a, communityId, cost.id);
    await changeEventAccount(a, communityId, eventId, {
      action: "CONFIGURE",
      mode: "NIGHT",
      periods: periods().map((period) => ({ ...period, userIds: [a, b] })),
      revision: (await view()).revision,
    });
    const frozen = await getCostShare(a, communityId, cost.id);
    expect(frozen.calculation).toEqual(before.calculation);
    expect(frozen.periods).toEqual(before.periods);
    expect(frozen.periods).toHaveLength(2);
    expect(
      new Set(
        (await getCostShare(a, communityId, cost.id)).participants.map((person) => person.id),
      ),
    ).toEqual(new Set([a, b, c]));
    expect(row(await view(), c).costSharesCents).toBe(5000);
    await setCostShareStatus(a, communityId, cost.id, "OPEN");
    expect(row(await view(), c).costSharesCents).toBe(0);
  });
  it("preserva conta fechada, impede mudanças vinculadas e recalcula ao reabrir", async () => {
    const emptyShare = await share("SELECTED", [a]);
    await configure();
    await enable();
    await pay(a, 50000);
    await pay(b, 50000);
    await pay(c, 20000);
    await changeEventAccount(a, communityId, eventId, {
      action: "CLOSE",
      revision: (await view()).revision,
    });
    const before = (await view()).summary;
    await expect(configure()).rejects.toMatchObject({ code: "ACCOUNT_CLOSED" });
    await expect(share("SELECTED", [a])).rejects.toMatchObject({ code: "ACCOUNT_CLOSED" });
    await expect(expense(emptyShare.id, a, 10)).rejects.toMatchObject({ code: "ACCOUNT_CLOSED" });
    await expect(
      updateEvent(a, communityId, eventId, { ...input, billingMode: "DAY" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_CLOSED" });
    await updateEvent(a, communityId, eventId, { ...input, estimatedCost: 1800 });
    expect((await view()).summary).toEqual(before);
    await changeEventAccount(a, communityId, eventId, { action: "REOPEN" });
    const reopened = await view();
    expect([a, b, c].map((id) => row(reopened, id).dueCents)).toEqual([25000, 25000, 10000]);
    expect(reopened.payments).toHaveLength(3);
  });
  it("serializa configuração com pagamento para não aplicar revisões contraditórias", async () => {
    await configure();
    await enable();
    const revision = (await view()).revision;
    const results = await Promise.allSettled([
      changeEventAccount(a, communityId, eventId, {
        action: "CONFIGURE",
        mode: "NIGHT",
        periods: periods().map((period) => ({ ...period, userIds: [a, b] })),
        revision,
      }),
      changeEventAccount(a, communityId, eventId, {
        action: "PAYMENT",
        userId: c,
        amountCents: 20000,
        direction: "RECEIVED",
        note: "",
        revision,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
      code: "ACCOUNT_CHANGED",
    });
  });
});
