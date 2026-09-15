import { describe, expect, it } from "vitest";
import { calculateEventAccount } from "@/server/domain/event-account";
import { eventAccountActionSchema } from "@/lib/validation/event-account";

const participants = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Pessoa ${i}` }));
const example = {
  currency: "BRL",
  eventCostCents: 300_000,
  confirmed: participants,
  shares: [
    {
      id: "a",
      title: "Churrasco",
      currency: "BRL",
      participants,
      expenses: [{ payerId: "0", amountCents: 50_000 }],
    },
    {
      id: "b",
      title: "Pizza",
      currency: "BRL",
      participants,
      expenses: [{ payerId: "1", amountCents: 30_000 }],
    },
  ],
  payments: [],
};
describe("conta do evento", () => {
  it("soma 3000 + 500 + 300 entre dez e abate compras de dois pagadores", () => {
    const { summary, issues } = calculateEventAccount(example);
    expect(issues).toEqual([]);
    expect(summary.totalCents).toBe(380_000);
    for (const person of summary.people)
      expect(person.eventShareCents + person.costSharesCents).toBe(38_000);
    expect(summary.people.find((p) => p.id === "0")?.dueCents).toBe(-12_000);
    expect(summary.people.find((p) => p.id === "1")?.dueCents).toBe(8_000);
    expect(summary.pendingCents - summary.refundableCents).toBe(300_000);
  });
  it("registra parcelas e reembolsos sem transformar créditos em cobranças", () => {
    const { summary } = calculateEventAccount({
      ...example,
      payments: [
        { userId: "2", name: "Pessoa 2", amountCents: 10_000, direction: "RECEIVED" },
        { userId: "0", name: "Pessoa 0", amountCents: 12_000, direction: "REFUNDED" },
      ],
    });
    expect(summary.people.find((p) => p.id === "2")?.dueCents).toBe(28_000);
    expect(summary.people.find((p) => p.id === "0")?.dueCents).toBe(0);
  });
  it("aceita várias parcelas antecipadas e transforma excesso pago em crédito", () => {
    const { summary } = calculateEventAccount({
      ...example,
      payments: [
        { userId: "2", name: "Pessoa 2", amountCents: 20_000, direction: "RECEIVED" },
        { userId: "2", name: "Pessoa 2", amountCents: 20_000, direction: "RECEIVED" },
        { userId: "2", name: "Pessoa 2", amountCents: 5_000, direction: "RECEIVED" },
      ],
    });
    expect(summary.people.find((p) => p.id === "2")).toMatchObject({
      receivedCents: 45_000,
      dueCents: -7_000,
    });
    expect(summary.refundableCents).toBe(19_000);
  });
  it("respeita participantes próprios de cada rateio e preserva centavos", () => {
    const { summary } = calculateEventAccount({
      ...example,
      eventCostCents: 100,
      confirmed: participants.slice(0, 3),
      shares: [
        {
          ...example.shares[0],
          participants: participants.slice(0, 2),
          expenses: [{ payerId: "0", amountCents: 101 }],
        },
      ],
    });
    expect(summary.people.map((p) => p.eventShareCents)).toEqual([34, 33, 33]);
    expect(summary.people.map((p) => p.costSharesCents)).toEqual([51, 50, 0]);
    expect(summary.people.reduce((sum, p) => sum + p.dueCents, 0)).toBe(100);
  });
  it("mantém quem já pagou mesmo após sair e sinaliza moedas incompatíveis e falta de confirmados", () => {
    const { summary, issues } = calculateEventAccount({
      ...example,
      confirmed: [],
      shares: [{ ...example.shares[0], currency: "USD" }],
      payments: [{ userId: "gone", name: "Saiu", amountCents: 500, direction: "RECEIVED" }],
    });
    expect(issues).toHaveLength(2);
    expect(summary.people[0]).toMatchObject({ id: "gone", dueCents: -500 });
  });
  it("aceita evento individual gratuito e rejeita centavos fracionários ou negativos na API", () => {
    expect(
      calculateEventAccount({
        ...example,
        eventCostCents: 0,
        confirmed: participants.slice(0, 1),
        shares: [],
      }).summary.people[0].dueCents,
    ).toBe(0);
    for (const amountCents of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        eventAccountActionSchema.safeParse({
          action: "PAYMENT",
          userId: "00000000-0000-4000-8000-000000000000",
          direction: "RECEIVED",
          amountCents,
          revision: "a".repeat(64),
        }).success,
      ).toBe(false);
    }
  });
});
