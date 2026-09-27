import { describe, expect, it } from "vitest";
import {
  ARENA_ITEM_CATALOG,
  ARENA_LOW_FAME_PENALTY,
  ARENA_MAX_LEVEL,
  arenaBattleReward,
  arenaEquipmentModifiers,
  arenaEquipmentSetForLevel,
  arenaExperienceForLevel,
  arenaFameChange,
  arenaLevelForExperience,
  arenaLowFamePenalty,
  arenaProgressAfterExperience,
} from "@/lib/games/arena-economy";
import { arenaDerivedStats, DEFAULT_ARENA_ATTRIBUTES } from "@/lib/games/arena";

describe("economia e progressão da Arena", () => {
  it("combina somente os bônus dos itens equipados", () => {
    const modifiers = arenaEquipmentModifiers(["COPPER_SHORT_SWORD", "LEATHER_VEST"]);
    expect(modifiers).toEqual({ baseDamage: 2, maxHealth: 8 });
    expect(arenaDerivedStats(DEFAULT_ARENA_ATTRIBUTES, modifiers)).toMatchObject({
      maxHealth: 64,
      baseDamage: 10,
    });
  });

  it("calcula níveis cumulativos e dois pontos por nível obtido", () => {
    expect(arenaExperienceForLevel(2)).toBe(150);
    expect(arenaExperienceForLevel(3)).toBe(450);
    expect(arenaLevelForExperience(449)).toBe(2);
    expect(arenaProgressAfterExperience(1, 450)).toMatchObject({
      level: 3,
      levelsGained: 2,
      skillPointsGained: 4,
    });
    expect(arenaLevelForExperience(arenaExperienceForLevel(100))).toBe(ARENA_MAX_LEVEL);
  });

  it("oferece conjuntos progressivos até o nível 60", () => {
    expect(ARENA_ITEM_CATALOG).toHaveLength(57);
    expect(
      Array.from(
        new Set(
          ARENA_ITEM_CATALOG.filter((item) => item.requiredLevel >= 5).map(
            (item) => item.requiredLevel,
          ),
        ),
      ),
    ).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    expect(arenaEquipmentSetForLevel(1)).toHaveLength(4);
    expect(arenaEquipmentSetForLevel(25)).toEqual([
      "TEMPEST_CRYSTAL_WEAPON",
      "TEMPEST_CRYSTAL_ARMOUR",
      "TEMPEST_CRYSTAL_HELMET",
      "TEMPEST_CRYSTAL_SHIELD",
    ]);
    expect(arenaEquipmentSetForLevel(60)).toEqual([
      "ETERNAL_WEAPON",
      "ETERNAL_ARMOUR",
      "ETERNAL_HELMET",
      "ETERNAL_SHIELD",
    ]);
  });

  it("diferencia vitória, derrota e abandono sem premiar desistência", () => {
    expect(arenaBattleReward("DESAFIADOR", "WON")).toEqual({
      gold: 240,
      experience: 130,
      fame: 7,
      shelterPoints: 8,
    });
    expect(arenaBattleReward("CHEFE", "WON")).toEqual({
      gold: 450,
      experience: 220,
      fame: 15,
      shelterPoints: 12,
    });
    expect(arenaBattleReward("INICIANTE", "LOST")).toEqual({
      gold: 0,
      experience: 15,
      fame: 0,
      shelterPoints: 1,
    });
    expect(arenaBattleReward("INICIANTE", "ABANDONED")).toEqual({
      gold: 0,
      experience: 0,
      fame: 0,
      shelterPoints: 0,
    });
    expect(arenaBattleReward("INICIANTE", "WON", 6, true)).toEqual({
      gold: 420,
      experience: 1320,
      fame: 4,
      shelterPoints: 3,
    });
    expect(arenaBattleReward("INICIANTE", "LOST", 22, true, 5).fame).toBe(0);
    expect(arenaBattleReward("INICIANTE", "LOST", 22, true, 6).fame).toBe(-1);
    expect(arenaBattleReward("CHEFE", "ABANDONED", 25, true, 6).fame).toBe(-1);
  });

  it("limita a fama negativa e ativa a penalidade somente no piso", () => {
    expect(arenaFameChange(4, -1)).toBe(-1);
    expect(arenaFameChange(0, -1)).toBe(-1);
    expect(arenaFameChange(-1, -1)).toBe(0);
    expect(arenaLowFamePenalty(0)).toBeNull();
    expect(arenaLowFamePenalty(-1)).toEqual(ARENA_LOW_FAME_PENALTY);
  });
});
