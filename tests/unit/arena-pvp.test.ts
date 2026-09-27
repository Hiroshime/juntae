import { describe, expect, it } from "vitest";
import {
  ARENA_PVP_MAX_LOOT,
  arenaPvpCombatPower,
  arenaPvpExperienceReward,
  arenaPvpLoot,
  arenaPvpRaidDuration,
  arenaPvpShelterDefenceBonus,
  resolveArenaPvpRaid,
  type ArenaPvpCombatSnapshot,
} from "@/lib/games/arena-pvp";
import { DEFAULT_ARENA_APPEARANCE, arenaDerivedStats } from "@/lib/games/arena";
import { arenaShelterStats } from "@/lib/games/arena-shelter";

function snapshot(name: string, level = 1): ArenaPvpCombatSnapshot {
  const derived = arenaDerivedStats({
    strength: 3,
    agility: 3,
    technique: 3,
    defence: 3,
    vitality: 3,
    presence: 3,
    stamina: 3,
  });
  const stats = arenaShelterStats(1, []);
  return {
    name,
    level,
    appearance: DEFAULT_ARENA_APPEARANCE,
    equipment: [],
    derived,
    combatPower: arenaPvpCombatPower(level, derived),
    shelter: {
      level: 1,
      name: "Acampamento de lona",
      stats,
      defenceBonus: arenaPvpShelterDefenceBonus(stats),
    },
  };
}

describe("motor de incursões PvP", () => {
  it("calcula duração pela diferença dos Refúgios e respeita os limites", () => {
    expect(arenaPvpRaidDuration(1, 1)).toBe(60);
    expect(arenaPvpRaidDuration(6, 1)).toBe(30);
    expect(arenaPvpRaidDuration(1, 6)).toBe(120);
    expect(arenaPvpRaidDuration(20, 1)).toBe(30);
    expect(arenaPvpRaidDuration(1, 20)).toBe(120);
  });

  it("limita o saque a 8%, ao saldo e ao teto", () => {
    expect(arenaPvpLoot(0)).toBe(0);
    expect(arenaPvpLoot(5)).toBe(5);
    expect(arenaPvpLoot(1_000)).toBe(80);
    expect(arenaPvpLoot(100_000)).toBe(ARENA_PVP_MAX_LOOT);
  });

  it("aplica todos os status do Acampamento ao bônus defensivo", () => {
    expect(
      arenaPvpShelterDefenceBonus({
        defence: 5,
        comfort: 2,
        supplies: 3,
        training: 4,
        prestige: 6,
      }),
    ).toBe(48);
  });

  it("resolve vitória e derrota com sorte limitada, XP e ferimento", () => {
    const attacker = snapshot("Atacante", 3);
    const defender = snapshot("Defensor", 2);
    defender.combatPower = attacker.combatPower;
    defender.shelter = null;
    const rolls = [0.999, 0];
    const won = resolveArenaPvpRaid(attacker, defender, 1_000, () => rolls.shift() ?? 0);
    expect(won).toMatchObject({
      status: "ATTACKER_WON",
      goldStolen: 80,
      experienceReward: arenaPvpExperienceReward(true, 2),
      injured: false,
    });

    const lost = resolveArenaPvpRaid(attacker, defender, 1_000, () => 0.5);
    expect(lost).toMatchObject({
      status: "DEFENDER_WON",
      goldStolen: 0,
      experienceReward: arenaPvpExperienceReward(false, 2),
      injured: true,
    });
  });
});
