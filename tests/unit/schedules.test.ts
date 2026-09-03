import { describe, expect, it } from "vitest";
import { calculateScheduleStatus, resolveAvailabilityStatus } from "@/server/domain/schedules";

describe("calculateScheduleStatus", () => {
  it("calcula uma escala semanal", () => {
    const rule = {
      ruleType: "WEEKLY" as const,
      startDate: "2026-01-01",
      weeklyPattern: { monday: "WORKING" as const, saturday: "DAY_OFF" as const },
    };
    expect(calculateScheduleStatus(rule, "2026-01-05")).toBe("WORKING");
    expect(calculateScheduleStatus(rule, "2026-01-10")).toBe("DAY_OFF");
  });

  it("calcula ciclos para datas anteriores e posteriores à âncora", () => {
    const rule = {
      ruleType: "CYCLE" as const,
      anchorDate: "2026-01-01",
      workDays: 1,
      restDays: 1,
      startDate: "2025-01-01",
    };
    expect(calculateScheduleStatus(rule, "2026-01-01")).toBe("WORKING");
    expect(calculateScheduleStatus(rule, "2026-01-02")).toBe("DAY_OFF");
    expect(calculateScheduleStatus(rule, "2025-12-31")).toBe("DAY_OFF");
  });

  it("respeita o intervalo configurado", () => {
    const rule = {
      ruleType: "CYCLE" as const,
      anchorDate: "2026-01-01",
      workDays: 4,
      restDays: 2,
      startDate: "2026-01-01",
      endDate: "2026-01-10",
    };
    expect(calculateScheduleStatus(rule, "2026-01-11")).toBeNull();
  });

  it("calcula escala 4x2 atravessando mês e ano", () => {
    const rule = {
      ruleType: "CYCLE" as const,
      anchorDate: "2025-12-30",
      workDays: 4,
      restDays: 2,
      startDate: "2025-12-01",
    };
    expect(calculateScheduleStatus(rule, "2025-12-31")).toBe("WORKING");
    expect(calculateScheduleStatus(rule, "2026-01-02")).toBe("WORKING");
    expect(calculateScheduleStatus(rule, "2026-01-03")).toBe("DAY_OFF");
    expect(calculateScheduleStatus(rule, "2026-01-04")).toBe("DAY_OFF");
  });

  it("resolve fevereiro em ano bissexto", () => {
    const rule = {
      ruleType: "CYCLE" as const,
      anchorDate: "2028-02-28",
      workDays: 1,
      restDays: 1,
      startDate: "2028-01-01",
    };
    expect(calculateScheduleStatus(rule, "2028-02-29")).toBe("DAY_OFF");
    expect(calculateScheduleStatus(rule, "2028-03-01")).toBe("WORKING");
  });
});

describe("availability precedence", () => {
  it("prioriza override manual", () => {
    expect(resolveAvailabilityStatus("WORKING", "DAY_OFF")).toBe("DAY_OFF");
    expect(resolveAvailabilityStatus("WORKING")).toBe("WORKING");
  });
});
