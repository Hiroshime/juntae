import { daysBetweenCivilDates, parseCivilDate } from "@/lib/dates/civil-date";

export const scheduleStatuses = ["WORKING", "DAY_OFF"] as const;
export type ScheduleStatus = (typeof scheduleStatuses)[number];

export type WeeklyPattern = Partial<Record<Weekday, ScheduleStatus>>;
export type Weekday =
  "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export type ScheduleRule =
  | {
      ruleType: "CYCLE";
      anchorDate: string;
      workDays: number;
      restDays: number;
      startDate: string;
      endDate?: string;
    }
  | {
      ruleType: "WEEKLY";
      weeklyPattern: WeeklyPattern;
      startDate: string;
      endDate?: string;
    };

const weekdays: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function isWithinRule(rule: ScheduleRule, date: string) {
  return date >= rule.startDate && (!rule.endDate || date <= rule.endDate);
}

export function calculateScheduleStatus(
  rule: ScheduleRule,
  targetDate: string,
): ScheduleStatus | null {
  parseCivilDate(targetDate);
  parseCivilDate(rule.startDate);
  if (rule.endDate) parseCivilDate(rule.endDate);
  if (!isWithinRule(rule, targetDate)) return null;

  if (rule.ruleType === "WEEKLY") {
    const weekday = weekdays[parseCivilDate(targetDate).getUTCDay()];
    return rule.weeklyPattern[weekday] ?? "DAY_OFF";
  }

  if (rule.workDays < 1 || rule.restDays < 1)
    throw new Error("O ciclo precisa ter dias de trabalho e descanso.");
  const cycleLength = rule.workDays + rule.restDays;
  const normalizedPosition =
    ((daysBetweenCivilDates(rule.anchorDate, targetDate) % cycleLength) + cycleLength) %
    cycleLength;
  return normalizedPosition < rule.workDays ? "WORKING" : "DAY_OFF";
}

export type AvailabilityStatus =
  | "AVAILABLE"
  | "PARTIALLY_AVAILABLE"
  | "WORKING"
  | "DAY_OFF"
  | "VACATION"
  | "UNAVAILABLE"
  | "UNKNOWN";

export function resolveAvailabilityStatus(
  calculatedStatus: AvailabilityStatus,
  manualOverride?: AvailabilityStatus,
) {
  return manualOverride ?? calculatedStatus;
}
