import { describe, expect, it } from "vitest";
import { costShareExpenseSchema } from "@/lib/validation/cost-share";
import { calculateCostShare } from "@/server/domain/cost-shares";

const participants = [
  { id: "jose", name: "José" },
  { id: "luiz", name: "Luiz" },
  { id: "maria", name: "Maria" },
];

describe("cost share calculation", () => {
  it("compensa vários compradores e gera apenas as transferências necessárias", () => {
    const result = calculateCostShare(participants, [
      { payerId: "jose", amountCents: 9_000 },
      { payerId: "luiz", amountCents: 6_000 },
    ]);
    expect(result.totalCents).toBe(15_000);
    expect(result.balances).toEqual([
      { id: "jose", name: "José", paidCents: 9_000, shareCents: 5_000, balanceCents: 4_000 },
      { id: "luiz", name: "Luiz", paidCents: 6_000, shareCents: 5_000, balanceCents: 1_000 },
      { id: "maria", name: "Maria", paidCents: 0, shareCents: 5_000, balanceCents: -5_000 },
    ]);
    expect(result.transfers).toEqual([
      {
        fromUserId: "maria",
        fromName: "Maria",
        toUserId: "jose",
        toName: "José",
        amountCents: 4_000,
      },
      {
        fromUserId: "maria",
        fromName: "Maria",
        toUserId: "luiz",
        toName: "Luiz",
        amountCents: 1_000,
      },
    ]);
  });

  it("distribui centavos restantes sem alterar o total", () => {
    const result = calculateCostShare(participants, [{ payerId: "jose", amountCents: 100 }]);
    expect(result.balances.map((balance) => balance.shareCents)).toEqual([34, 33, 33]);
    expect(result.balances.reduce((total, balance) => total + balance.shareCents, 0)).toBe(100);
    expect(result.balances.reduce((total, balance) => total + balance.balanceCents, 0)).toBe(0);
  });

  it("recusa pagador que não participa do rateio", () => {
    expect(() =>
      calculateCostShare(participants, [{ payerId: "intruso", amountCents: 100 }]),
    ).toThrow("UNKNOWN_PAYER");
  });

  it("recusa valores monetários com frações menores que um centavo", () => {
    expect(
      costShareExpenseSchema.safeParse({
        description: "Compra",
        amount: 10.999,
        payerId: "27650a52-44ac-46e8-8836-38ed6f535951",
        purchasedAt: "2026-09-04",
      }).success,
    ).toBe(false);
  });
});
