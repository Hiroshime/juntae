import { describe, expect, it } from "vitest";
import {
  packingListSchema,
  packingItemSchema,
  packingItemActionSchema,
} from "@/lib/validation/packing-list";

describe("validação das listas", () => {
  it("normaliza títulos e aceita lista independente e quantidades livres", () => {
    expect(packingListSchema.parse({ title: "  Café da manhã  ", eventId: "" })).toEqual({
      title: "Café da manhã",
      description: null,
      eventId: null,
    });
    expect(packingItemSchema.parse({ name: "  Leite ", quantity: " 2 litros " })).toMatchObject({
      name: "Leite",
      quantity: "2 litros",
      responsibleUserId: null,
      responsibleLabel: null,
    });
  });

  it("exige contato para casal e rejeita dados excessivos ou inválidos", () => {
    expect(
      packingItemSchema.safeParse({ name: "Pão", responsibleLabel: "Luiz e Ana" }).success,
    ).toBe(false);
    expect(packingItemSchema.safeParse({ name: " " }).success).toBe(false);
    expect(packingItemSchema.safeParse({ name: "Pão", quantity: "a".repeat(101) }).success).toBe(
      false,
    );
    expect(packingListSchema.safeParse({ title: "Café", eventId: "evento-inválido" }).success).toBe(
      false,
    );
    expect(
      packingListSchema.safeParse({ title: "Café", description: "a".repeat(2001) }).success,
    ).toBe(false);
    expect(
      packingItemActionSchema.safeParse({ action: "delivered", delivered: "false" }).success,
    ).toBe(false);
    expect(
      packingItemActionSchema.safeParse({ action: "assign", userId: "outra-pessoa" }).success,
    ).toBe(false);
  });
});
