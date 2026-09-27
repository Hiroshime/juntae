import { describe, expect, it } from "vitest";
import {
  ARENA_ATTRIBUTE_TOTAL,
  DEFAULT_ARENA_APPEARANCE,
  DEFAULT_ARENA_ATTRIBUTES,
  arenaAttributePointsRemaining,
  arenaAttributeTotal,
  arenaDerivedStats,
  isValidStartingArenaAttributes,
} from "@/lib/games/arena";
import {
  arenaAppearanceSchema,
  createArenaGladiatorSchema,
  resetArenaGladiatorSchema,
  purchaseArenaShelterItemSchema,
  startArenaOccupationSchema,
  startArenaPvpRaidSchema,
  upgradeArenaShelterSchema,
} from "@/lib/validation/arena";

describe("Arena dos Campeões", () => {
  it("aceita somente UUID do alvo no início de um saque PvP", () => {
    expect(
      startArenaPvpRaidSchema.safeParse({
        defenderId: "302a4dee-0adf-4b86-b126-6d73a08c30dc",
      }).success,
    ).toBe(true);
    expect(startArenaPvpRaidSchema.safeParse({ defenderId: "alvo", extra: true }).success).toBe(
      false,
    );
  });

  it("distribui exatamente os pontos iniciais e calcula a ficha derivada", () => {
    expect(arenaAttributeTotal(DEFAULT_ARENA_ATTRIBUTES)).toBe(ARENA_ATTRIBUTE_TOTAL);
    expect(arenaAttributePointsRemaining(DEFAULT_ARENA_ATTRIBUTES)).toBe(0);
    expect(isValidStartingArenaAttributes(DEFAULT_ARENA_ATTRIBUTES)).toBe(true);
    expect(arenaDerivedStats(DEFAULT_ARENA_ATTRIBUTES)).toEqual({
      maxHealth: 56,
      maxEnergy: 40,
      baseDamage: 8,
      accuracy: 59,
      evasion: 8,
      guard: 8,
      crowdBonus: 6,
      movement: 5,
    });
  });

  it("rejeita pontos faltando, atributo acima do teto e aparência desconhecida", () => {
    expect(
      createArenaGladiatorSchema.safeParse({
        name: "Aurora",
        origin: "ILHAS_TORMENTA",
        entryLine: "",
        victoryLine: "",
        appearance: DEFAULT_ARENA_APPEARANCE,
        attributes: { ...DEFAULT_ARENA_ATTRIBUTES, strength: 2 },
      }).success,
    ).toBe(false);
    expect(
      createArenaGladiatorSchema.safeParse({
        name: "Aurora",
        origin: "ILHAS_TORMENTA",
        appearance: DEFAULT_ARENA_APPEARANCE,
        attributes: {
          ...DEFAULT_ARENA_ATTRIBUTES,
          strength: 9,
          agility: 1,
          technique: 2,
        },
      }).success,
    ).toBe(false);
    expect(
      arenaAppearanceSchema.safeParse({
        ...DEFAULT_ARENA_APPEARANCE,
        hairStyle: "CAPACETE_COPIADO",
      }).success,
    ).toBe(false);
  });

  it("aceita uma identidade original completa com o orçamento exato", () => {
    const parsed = createArenaGladiatorSchema.parse({
      name: "Cassius Aurora",
      origin: "PORTOS_AMBAR",
      entryLine: "A areia lembrará meus passos.",
      victoryLine: "Que venha o próximo!",
      appearance: { ...DEFAULT_ARENA_APPEARANCE, hairStyle: "BRAIDS" },
      attributes: {
        strength: 5,
        agility: 4,
        technique: 3,
        defence: 3,
        vitality: 2,
        presence: 2,
        stamina: 2,
      },
    });
    expect(parsed.name).toBe("Cassius Aurora");
    expect(arenaAttributeTotal(parsed.attributes)).toBe(ARENA_ATTRIBUTE_TOTAL);
  });

  it("exige uma confirmação estrita para reiniciar o gladiador", () => {
    expect(resetArenaGladiatorSchema.safeParse({ confirmation: "Lysandra" }).success).toBe(true);
    expect(resetArenaGladiatorSchema.safeParse({ confirmation: "" }).success).toBe(false);
    expect(
      resetArenaGladiatorSchema.safeParse({ confirmation: "Lysandra", extra: true }).success,
    ).toBe(false);
  });

  it("aceita somente a ação vazia para melhorar o Refúgio", () => {
    expect(upgradeArenaShelterSchema.safeParse({}).success).toBe(true);
    expect(upgradeArenaShelterSchema.safeParse({ level: 6 }).success).toBe(false);
  });

  it("aceita somente atividades existentes do campo de treino", () => {
    expect(startArenaOccupationSchema.safeParse({ taskKey: "MARKET_PATROL" }).success).toBe(true);
    expect(startArenaOccupationSchema.safeParse({ taskKey: "UNKNOWN" }).success).toBe(false);
    expect(
      startArenaOccupationSchema.safeParse({ taskKey: "MARKET_PATROL", durationHours: 1 }).success,
    ).toBe(false);
  });

  it("aceita somente itens existentes do Acampamento", () => {
    expect(
      purchaseArenaShelterItemSchema.safeParse({ catalogItemKey: "IRON_BRAZIER" }).success,
    ).toBe(true);
    expect(
      purchaseArenaShelterItemSchema.safeParse({ catalogItemKey: "ETERNAL_FLAME" }).success,
    ).toBe(true);
    expect(purchaseArenaShelterItemSchema.safeParse({ catalogItemKey: "UNKNOWN" }).success).toBe(
      false,
    );
    expect(
      purchaseArenaShelterItemSchema.safeParse({
        catalogItemKey: "IRON_BRAZIER",
        price: 1,
      }).success,
    ).toBe(false);
  });
});
