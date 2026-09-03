import { describe, expect, it } from "vitest";
import { nextWeekendDates, selectBestOpportunities } from "@/server/domain/dashboard";
import { summarizeAvailability } from "@/server/domain/availability-scoring";

describe("dashboard domain", () => {
  it("encontra sábado e domingo do próximo fim de semana", () => {
    expect(nextWeekendDates("2026-09-01")).toEqual({
      saturday: "2026-09-05",
      sunday: "2026-09-06",
    });
    expect(nextWeekendDates("2026-09-05")).toEqual({
      saturday: "2026-09-05",
      sunday: "2026-09-06",
    });
    expect(nextWeekendDates("2026-09-06")).toEqual({
      saturday: "2026-09-12",
      sunday: "2026-09-13",
    });
  });

  it("seleciona oportunidades pela regra transparente de score", () => {
    const summaries = [
      summarizeAvailability("2026-09-03", ["AVAILABLE", "UNKNOWN"]),
      summarizeAvailability("2026-09-02", ["DAY_OFF", "AVAILABLE"]),
      summarizeAvailability("2026-09-01", ["PARTIALLY_AVAILABLE", "AVAILABLE"]),
      summarizeAvailability("2026-09-04", ["UNKNOWN", "UNKNOWN"]),
    ];
    expect(selectBestOpportunities(summaries, 3).map((item) => item.date)).toEqual([
      "2026-09-02",
      "2026-09-01",
      "2026-09-03",
    ]);
  });
});
