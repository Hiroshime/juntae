import { describe, expect, it } from "vitest";
import { formatScheduleFreeTime } from "@/features/availability/schedule-availability-hint";
import { scheduleRuleSchema } from "@/lib/validation/availability";
import {
  calculateScheduleAvailability,
  calculateScheduleDayAvailability,
  calculateScheduleStatus,
  resolveAvailabilityStatus,
} from "@/server/domain/schedules";

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

describe("calculateScheduleAvailability", () => {
  const daytimeRule = {
    ruleType: "WEEKLY" as const,
    startDate: "2026-01-01",
    weeklyPattern: { monday: "WORKING" as const },
    workStartMinute: 8 * 60,
    workEndMinute: 17 * 60 + 30,
  };

  it("considera livre o período fora do turno diurno", () => {
    expect(calculateScheduleAvailability(daytimeRule, "2026-01-05", "ALL")).toBe(
      "PARTIALLY_AVAILABLE",
    );
    expect(calculateScheduleAvailability(daytimeRule, "2026-01-05", "MORNING")).toBe(
      "PARTIALLY_AVAILABLE",
    );
    expect(calculateScheduleAvailability(daytimeRule, "2026-01-05", "EVENING")).toBe("AVAILABLE");
    const day = calculateScheduleDayAvailability(daytimeRule, "2026-01-05");
    expect(day).toMatchObject({
      status: "PARTIALLY_AVAILABLE",
      workingIntervals: [{ startMinute: 480, endMinute: 1050 }],
      freeIntervals: [
        { startMinute: 0, endMinute: 480 },
        { startMinute: 1050, endMinute: 1440 },
      ],
    });
    expect(formatScheduleFreeTime({ name: "Comercial", ...day })).toBe(
      "Livre até 08:00 e após 17:30",
    );
  });

  it("leva o fim do turno noturno para o dia seguinte", () => {
    const overnightRule = {
      ruleType: "CYCLE" as const,
      anchorDate: "2026-09-01",
      workDays: 1,
      restDays: 1,
      startDate: "2026-09-01",
      workStartMinute: 19 * 60,
      workEndMinute: 7 * 60,
    };
    expect(calculateScheduleAvailability(overnightRule, "2026-09-01", "EVENING")).toBe(
      "PARTIALLY_AVAILABLE",
    );
    expect(calculateScheduleAvailability(overnightRule, "2026-09-02", "MORNING")).toBe(
      "PARTIALLY_AVAILABLE",
    );
    expect(calculateScheduleAvailability(overnightRule, "2026-09-02", "AFTERNOON")).toBe("DAY_OFF");
    expect(
      formatScheduleFreeTime({
        name: "Plantão 12x36",
        ...calculateScheduleDayAvailability(overnightRule, "2026-09-02"),
      }),
    ).toBe("Livre após 07:00");
  });

  it("mantém escalas antigas sem horário como trabalho no dia inteiro", () => {
    const legacyRule = {
      ruleType: "WEEKLY" as const,
      startDate: "2026-01-01",
      weeklyPattern: { monday: "WORKING" as const },
    };
    expect(calculateScheduleAvailability(legacyRule, "2026-01-05", "EVENING")).toBe("WORKING");
  });

  it("considera o término noturno após a última data da regra", () => {
    const finalShift = {
      ruleType: "WEEKLY" as const,
      startDate: "2026-01-05",
      endDate: "2026-01-05",
      weeklyPattern: { monday: "WORKING" as const },
      workStartMinute: 20 * 60,
      workEndMinute: 6 * 60,
    };
    expect(calculateScheduleAvailability(finalShift, "2026-01-06", "ALL")).toBe(
      "PARTIALLY_AVAILABLE",
    );
  });
});

describe("availability precedence", () => {
  it("prioriza override manual", () => {
    expect(resolveAvailabilityStatus("WORKING", "DAY_OFF")).toBe("DAY_OFF");
    expect(resolveAvailabilityStatus("WORKING")).toBe("WORKING");
  });
});

describe("scheduleRuleSchema", () => {
  const baseRule = {
    name: "Expediente",
    ruleType: "CYCLE" as const,
    anchorDate: "2026-09-01",
    workDays: 1,
    restDays: 1,
    startDate: "2026-09-01",
    endDate: null,
    status: "ACTIVE" as const,
  };

  it("aceita minuto e turno que atravessa a meia-noite", () => {
    expect(
      scheduleRuleSchema.parse({
        ...baseRule,
        workStartTime: "19:15",
        workEndTime: "07:30",
      }),
    ).toMatchObject({ workStartTime: "19:15", workEndTime: "07:30" });
  });

  it("mantém clientes antigos como escala de dia inteiro", () => {
    expect(scheduleRuleSchema.parse(baseRule)).toMatchObject({
      workStartTime: null,
      workEndTime: null,
    });
  });

  it("rejeita horário incompleto ou sem duração", () => {
    expect(scheduleRuleSchema.safeParse({ ...baseRule, workStartTime: "08:00" }).success).toBe(
      false,
    );
    expect(
      scheduleRuleSchema.safeParse({
        ...baseRule,
        workStartTime: "08:00",
        workEndTime: "08:00",
      }).success,
    ).toBe(false);
  });
});
