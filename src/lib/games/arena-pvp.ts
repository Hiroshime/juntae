import type { ArenaAppearance, ArenaDerivedStats } from "@/lib/games/arena";
import type { ArenaShelterStats } from "@/lib/games/arena-shelter";

export const ARENA_PVP_MIN_DURATION_MINUTES = 30;
export const ARENA_PVP_MAX_DURATION_MINUTES = 120;
export const ARENA_PVP_INJURY_MINUTES = 30;
export const ARENA_PVP_MAX_LOOT = 250;

export type ArenaPvpCombatSnapshot = {
  name: string;
  level: number;
  appearance: ArenaAppearance;
  equipment: string[];
  derived: ArenaDerivedStats;
  combatPower: number;
  shelter: {
    level: number;
    name: string;
    stats: ArenaShelterStats;
    defenceBonus: number;
  } | null;
};

export function arenaPvpRaidDuration(attackerShelterLevel: number, defenderShelterLevel: number) {
  const duration = 60 + (defenderShelterLevel - attackerShelterLevel) * 15;
  return Math.max(
    ARENA_PVP_MIN_DURATION_MINUTES,
    Math.min(ARENA_PVP_MAX_DURATION_MINUTES, duration),
  );
}

export function arenaPvpCombatPower(level: number, derived: ArenaDerivedStats) {
  return Math.round(
    level * 8 +
      derived.maxHealth / 3 +
      derived.maxEnergy / 5 +
      derived.baseDamage * 5 +
      derived.accuracy / 2 +
      derived.evasion * 2 +
      derived.guard * 3,
  );
}

export function arenaPvpShelterDefenceBonus(stats: ArenaShelterStats) {
  return stats.defence * 6 + stats.comfort + stats.supplies * 2 + stats.training + stats.prestige;
}

export function arenaPvpRoll(power: number, random: () => number) {
  const bounded = Math.max(0, Math.min(0.999999, random()));
  const multiplier = 0.85 + bounded * 0.3;
  return Math.max(1, Math.round(power * multiplier));
}

export function arenaPvpExperienceReward(won: boolean, defenderLevel: number) {
  const safeLevel = Math.max(1, Math.floor(defenderLevel));
  return won ? 35 + safeLevel * 5 : 10 + safeLevel * 2;
}

export function arenaPvpLoot(defenderGold: number) {
  const available = Math.max(0, Math.floor(defenderGold));
  if (available === 0) return 0;
  return Math.min(available, ARENA_PVP_MAX_LOOT, Math.max(10, Math.floor(available * 0.08)));
}

export function resolveArenaPvpRaid(
  attacker: ArenaPvpCombatSnapshot,
  defender: ArenaPvpCombatSnapshot,
  defenderGold: number,
  random: () => number,
) {
  const attackerScore = arenaPvpRoll(attacker.combatPower, random);
  const defenderScore = arenaPvpRoll(
    defender.combatPower + (defender.shelter?.defenceBonus ?? 0),
    random,
  );
  const attackerWon = attackerScore > defenderScore;
  return {
    status: attackerWon ? ("ATTACKER_WON" as const) : ("DEFENDER_WON" as const),
    attackerScore,
    defenderScore,
    goldStolen: attackerWon ? arenaPvpLoot(defenderGold) : 0,
    experienceReward: arenaPvpExperienceReward(attackerWon, defender.level),
    injured: !attackerWon,
  };
}
