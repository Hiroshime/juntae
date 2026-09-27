import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArenaShelter } from "@/features/games/arena-shelter";
import {
  ARENA_MAX_SHELTER_LEVEL,
  ARENA_SHELTER_ITEM_CATALOG,
  arenaShelterPointsReward,
  arenaShelterProgress,
  arenaShelterStats,
  arenaShelterStage,
} from "@/lib/games/arena-shelter";

describe("progressão do Refúgio da Arena", () => {
  it("possui dez estágios, custos crescentes e limite máximo", () => {
    expect(ARENA_MAX_SHELTER_LEVEL).toBe(10);
    expect(arenaShelterProgress(1, 7)).toMatchObject({
      name: "Acampamento de lona",
      nextCost: 8,
      canUpgrade: false,
      progressPercentage: 88,
    });
    expect(arenaShelterProgress(1, 8)).toMatchObject({ canUpgrade: true, progressPercentage: 100 });
    expect(arenaShelterProgress(6, 109)).toMatchObject({
      name: "Cidadela solar",
      nextCost: 110,
      isMaximum: false,
      canUpgrade: false,
    });
    expect(arenaShelterProgress(10, 500)).toMatchObject({
      name: "Santuário dos imortais",
      nextCost: null,
      isMaximum: true,
      canUpgrade: false,
    });
    expect(arenaShelterStage(99).level).toBe(10);
  });

  it("premia combates concluídos conforme resultado e dificuldade", () => {
    expect(arenaShelterPointsReward("INICIANTE", "WON")).toBe(3);
    expect(arenaShelterPointsReward("INTERMEDIARIO", "WON")).toBe(5);
    expect(arenaShelterPointsReward("DESAFIADOR", "WON")).toBe(8);
    expect(arenaShelterPointsReward("CHEFE", "WON")).toBe(12);
    expect(arenaShelterPointsReward("CHEFE", "LOST")).toBe(1);
    expect(arenaShelterPointsReward("CHEFE", "ABANDONED")).toBe(0);
  });

  it("calcula status próprios por nível e por itens sem duplicar bônus", () => {
    expect(ARENA_SHELTER_ITEM_CATALOG).toHaveLength(13);
    expect(arenaShelterStats(1, [])).toEqual({
      defence: 2,
      comfort: 1,
      supplies: 1,
      training: 1,
      prestige: 0,
    });
    expect(arenaShelterStats(2, ["REINFORCED_CHEST", "IRON_BRAZIER", "IRON_BRAZIER"])).toEqual({
      defence: 5,
      comfort: 5,
      supplies: 5,
      training: 2,
      prestige: 3,
    });
    expect(arenaShelterStats(10, ["ETERNAL_FLAME"])).toEqual({
      defence: 23,
      comfort: 13,
      supplies: 13,
      training: 14,
      prestige: 28,
    });
  });

  it("evolui a construção visual até o Santuário dos imortais", () => {
    const camp = renderToStaticMarkup(
      createElement(ArenaShelter, { level: 1, name: "Acampamento de lona" }),
    );
    const sanctuary = renderToStaticMarkup(
      createElement(ArenaShelter, { level: 10, name: "Santuário dos imortais" }),
    );
    expect(camp).toContain('data-shelter-level="1"');
    expect(camp).toContain('class="arena-shelter-tent"');
    expect(camp).not.toContain("arena-shelter-towers");
    expect(sanctuary).toContain('data-shelter-level="10"');
    expect(sanctuary).toContain('class="arena-shelter-towers"');
    expect(sanctuary).toContain('class="arena-shelter-banners"');
    expect(sanctuary).toContain('class="arena-shelter-palace"');
    expect(sanctuary).toContain('class="arena-shelter-imperial"');
    expect(sanctuary).toContain('class="arena-shelter-celestial"');
    expect(sanctuary).toContain('class="arena-shelter-immortal"');

    const furnished = renderToStaticMarkup(
      createElement(ArenaShelter, {
        level: 10,
        name: "Santuário",
        itemKeys: ["REINFORCED_CHEST", "TRAINING_DUMMY", "ETERNAL_FLAME"],
      }),
    );
    expect(furnished).toContain('data-item-key="REINFORCED_CHEST"');
    expect(furnished).toContain('data-item-key="TRAINING_DUMMY"');
    expect(furnished).toContain('data-item-key="ETERNAL_FLAME"');
  });
});
