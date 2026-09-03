import { describe, expect, it } from "vitest";
import {
  filterBestDates,
  rankBestDates,
  summarizeAvailability,
} from "@/server/domain/availability-scoring";

describe("availability scoring", () => {
  it("soma disponibilidade completa, parcial e desconhecida", () => {
    const result = summarizeAvailability("2026-09-19", [
      "AVAILABLE",
      "PARTIALLY_AVAILABLE",
      "UNKNOWN",
      "WORKING",
    ]);
    expect(result.fullAvailableCount).toBe(1);
    expect(result.partialAvailableCount).toBe(1);
    expect(result.workingCount).toBe(1);
    expect(result.unavailableCount).toBe(0);
    expect(result.unknownCount).toBe(1);
    expect(result.score).toBe(1.5);
  });

  it("separa trabalho de indisponibilidade explícita", () => {
    const result = summarizeAvailability("2026-09-19", [
      "WORKING",
      "WORKING",
      "UNAVAILABLE",
      "UNKNOWN",
    ]);
    expect(result.workingCount).toBe(2);
    expect(result.unavailableCount).toBe(1);
    expect(result.unknownCount).toBe(1);
    expect(result.fullAvailableCount).toBe(0);
    expect(result.score).toBe(0);
  });

  it("ordena por score, completos, desconhecidos e data", () => {
    const results = [
      summarizeAvailability("2026-09-20", ["AVAILABLE"]),
      summarizeAvailability("2026-09-19", ["PARTIALLY_AVAILABLE", "PARTIALLY_AVAILABLE"]),
      summarizeAvailability("2026-09-18", ["AVAILABLE"]),
    ];
    expect(rankBestDates(results).map((item) => item.date)).toEqual([
      "2026-09-18",
      "2026-09-20",
      "2026-09-19",
    ]);
  });

  it("filtra finais de semana e mínimo de pessoas completamente disponíveis", () => {
    const results = [
      summarizeAvailability("2026-09-18", ["AVAILABLE", "AVAILABLE"]),
      summarizeAvailability("2026-09-19", ["DAY_OFF", "UNKNOWN"]),
      summarizeAvailability("2026-09-20", ["VACATION", "AVAILABLE"]),
    ];
    expect(
      filterBestDates(results, { onlyWeekends: true, minPeople: 2 }).map((item) => item.date),
    ).toEqual(["2026-09-20"]);
  });

  it("mantém unknown com score zero e retorna vazio quando ninguém atinge o mínimo", () => {
    const unknown = [
      summarizeAvailability("2026-09-19", ["UNKNOWN", "UNKNOWN"]),
      summarizeAvailability("2026-09-20", ["UNKNOWN", "UNKNOWN"]),
    ];
    expect(rankBestDates(unknown).map((item) => item.date)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(filterBestDates(unknown, { minPeople: 1 })).toEqual([]);
  });
});
