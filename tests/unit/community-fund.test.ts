import { describe, expect, it } from "vitest";
import {
  communityFundDepositSchema,
  communityFundEntryActionSchema,
  communityFundUsageSchema,
} from "@/lib/validation/community-fund";
import { calculateCommunityFund } from "@/server/domain/community-fund";

describe("Fundão da comunidade", () => {
  it("contabiliza somente depósitos e usos aprovados", () => {
    const result = calculateCommunityFund([
      { userId: "ana", type: "DEPOSIT", status: "APPROVED", amountCents: 5_000 },
      { userId: "ana", type: "USAGE", status: "APPROVED", amountCents: 1_500 },
      { userId: "bia", type: "DEPOSIT", status: "APPROVED", amountCents: 3_000 },
      { userId: "bia", type: "DEPOSIT", status: "PENDING", amountCents: 9_000 },
      { userId: "ana", type: "DEPOSIT", status: "VOIDED", amountCents: 800 },
      { userId: "bia", type: "DEPOSIT", status: "REJECTED", amountCents: 700 },
    ]);

    expect(result.totalCents).toBe(6_500);
    expect(result.balances.get("ana")).toBe(3_500);
    expect(result.balances.get("bia")).toBe(3_000);
  });

  it("valida dinheiro, mês, data e finalidade do uso", () => {
    expect(
      communityFundDepositSchema.safeParse({
        amountCents: 5_000,
        referenceMonth: "2026-10",
        effectiveDate: "2026-10-13",
        note: "PIX",
      }).success,
    ).toBe(true);
    expect(
      communityFundDepositSchema.safeParse({
        amountCents: 0,
        referenceMonth: "2026-13",
        effectiveDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      communityFundUsageSchema.safeParse({
        userId: "5bd60652-a927-4d04-b651-07b87ff43f25",
        eventId: null,
        amountCents: 1_000,
        effectiveDate: "2026-10-13",
        note: "Entrada da chácara",
      }).success,
    ).toBe(true);
  });

  it("exige motivo para rejeitar ou anular", () => {
    expect(communityFundEntryActionSchema.safeParse({ action: "APPROVE" }).success).toBe(true);
    expect(communityFundEntryActionSchema.safeParse({ action: "CANCEL" }).success).toBe(true);
    expect(communityFundEntryActionSchema.safeParse({ action: "REJECT", note: "" }).success).toBe(
      false,
    );
    expect(
      communityFundEntryActionSchema.safeParse({ action: "VOID", note: "Lançado em duplicidade" })
        .success,
    ).toBe(true);
  });
});
