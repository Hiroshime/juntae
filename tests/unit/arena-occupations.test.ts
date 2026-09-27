import { describe, expect, it } from "vitest";
import {
  ARENA_OCCUPATION_TASKS,
  arenaActiveOccupationEffects,
  arenaOccupationEffectModifiers,
  combineArenaStatModifiers,
  resolveArenaOccupation,
} from "@/lib/games/arena-occupations";

describe("treinos e missões da Arena", () => {
  it("oferece progressão crescente e mantém treinos sem incidentes", () => {
    const trainings = ARENA_OCCUPATION_TASKS.filter((task) => task.kind === "TRAINING");
    const missions = ARENA_OCCUPATION_TASKS.filter((task) => task.kind === "MISSION");
    expect(trainings.map((task) => task.durationHours)).toEqual([1, 2, 4]);
    expect(missions.map((task) => task.durationHours)).toEqual([1, 2, 4, 8]);
    expect(missions.map((task) => task.riskPercent)).toEqual([10, 15, 22, 30]);
    expect(resolveArenaOccupation(trainings[0], () => 0)).toMatchObject({
      incident: null,
      rewards: { experience: 25, shelterPoints: 1 },
    });
  });

  it("aplica um incidente apenas quando a missão falha no teste de risco", () => {
    const mission = ARENA_OCCUPATION_TASKS.find((task) => task.key === "MARKET_PATROL")!;
    expect(resolveArenaOccupation(mission, () => 1).incident).toBeNull();
    const rolls = [0, 0];
    const result = resolveArenaOccupation(mission, () => rolls.shift() ?? 0);
    expect(result).toMatchObject({
      incident: "ROBBED",
      rewards: { gold: 35, experience: 20, shelterPoints: 2 },
    });
  });

  it("combina somente efeitos ainda válidos com outros modificadores", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    const effects = arenaActiveOccupationEffects(
      [
        { incident: "BRUISED", effectExpiresAt: new Date("2026-09-25T13:00:00.000Z") },
        { incident: "EXHAUSTED", effectExpiresAt: new Date("2026-09-25T11:00:00.000Z") },
      ],
      now,
    );
    expect(effects.map((effect) => effect.key)).toEqual(["BRUISED"]);
    expect(
      combineArenaStatModifiers(
        { maxHealth: 8, guard: 1 },
        arenaOccupationEffectModifiers(effects),
      ),
    ).toEqual({ maxHealth: -2, guard: -1 });
  });
});
