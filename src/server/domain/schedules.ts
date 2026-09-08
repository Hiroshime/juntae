import {
  addCivilDays,
  daysBetweenCivilDates,
  parseCivilDate,
  type DayPeriod,
} from "@/lib/dates/civil-date";

export const scheduleStatuses = ["WORKING", "DAY_OFF"] as const;
export type ScheduleStatus = (typeof scheduleStatuses)[number];

export type WeeklyPattern = Partial<Record<Weekday, ScheduleStatus>>;
export type Weekday =
  "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

type WorkWindow = {
  workStartMinute?: number | null;
  workEndMinute?: number | null;
};

export type ScheduleRule = WorkWindow &
  (
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
      }
  );

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

const periodMinutes: Record<DayPeriod, readonly [number, number]> = {
  ALL: [0, 1440],
  MORNING: [6 * 60, 12 * 60],
  AFTERNOON: [12 * 60, 18 * 60],
  EVENING: [18 * 60, 1440],
};

export type ScheduleMinuteInterval = { startMinute: number; endMinute: number };

export type ScheduleDayAvailability = {
  status: AvailabilityStatus | null;
  workingIntervals: ScheduleMinuteInterval[];
  freeIntervals: ScheduleMinuteInterval[];
};

function workWindow(rule: ScheduleRule) {
  const { workStartMinute: start, workEndMinute: end } = rule;
  if (start == null && end == null) return null;
  if (
    start == null ||
    end == null ||
    start < 0 ||
    start > 1439 ||
    end < 0 ||
    end > 1439 ||
    start === end
  ) {
    throw new Error("O horário de trabalho da escala é inválido.");
  }
  return { start, end, overnight: end < start };
}

function overlapMinutes(interval: ScheduleMinuteInterval, period: readonly [number, number]) {
  return Math.max(
    0,
    Math.min(interval.endMinute, period[1]) - Math.max(interval.startMinute, period[0]),
  );
}

function freeIntervalsForDay(workingIntervals: ScheduleMinuteInterval[]) {
  const freeIntervals: ScheduleMinuteInterval[] = [];
  let cursor = 0;
  for (const interval of workingIntervals) {
    if (interval.startMinute > cursor) {
      freeIntervals.push({ startMinute: cursor, endMinute: interval.startMinute });
    }
    cursor = Math.max(cursor, interval.endMinute);
  }
  if (cursor < 1440) freeIntervals.push({ startMinute: cursor, endMinute: 1440 });
  return freeIntervals;
}

/**
 * Resolves status and exact local-time intervals for one civil day. Overnight
 * shifts contribute their post-midnight segment to the following day.
 */
export function calculateScheduleDayAvailability(
  rule: ScheduleRule,
  targetDate: string,
  period: DayPeriod = "ALL",
): ScheduleDayAvailability {
  const window = workWindow(rule);
  const currentStatus = calculateScheduleStatus(rule, targetDate);
  if (!window) {
    return {
      status: currentStatus,
      workingIntervals: currentStatus === "WORKING" ? [{ startMinute: 0, endMinute: 1440 }] : [],
      freeIntervals: currentStatus === "DAY_OFF" ? [{ startMinute: 0, endMinute: 1440 }] : [],
    };
  }

  const previousStatus = window.overnight
    ? calculateScheduleStatus(rule, addCivilDays(targetDate, -1))
    : null;
  const workingIntervals: ScheduleMinuteInterval[] = [];

  if (window.overnight && previousStatus === "WORKING" && window.end > 0) {
    workingIntervals.push({ startMinute: 0, endMinute: window.end });
  }
  if (currentStatus === "WORKING") {
    workingIntervals.push(
      window.overnight
        ? { startMinute: window.start, endMinute: 1440 }
        : { startMinute: window.start, endMinute: window.end },
    );
  }

  if (currentStatus == null && workingIntervals.length === 0) {
    return { status: null, workingIntervals: [], freeIntervals: [] };
  }

  const selectedPeriod = periodMinutes[period];
  const coveredMinutes = workingIntervals.reduce(
    (total, interval) => total + overlapMinutes(interval, selectedPeriod),
    0,
  );
  let status: AvailabilityStatus;
  if (coveredMinutes === 0) {
    status = currentStatus === "DAY_OFF" ? "DAY_OFF" : "AVAILABLE";
  } else if (coveredMinutes >= selectedPeriod[1] - selectedPeriod[0]) {
    status = "WORKING";
  } else {
    status = "PARTIALLY_AVAILABLE";
  }

  return {
    status,
    workingIntervals,
    freeIntervals: freeIntervalsForDay(workingIntervals),
  };
}

export function calculateScheduleAvailability(
  rule: ScheduleRule,
  targetDate: string,
  period: DayPeriod = "ALL",
): AvailabilityStatus | null {
  return calculateScheduleDayAvailability(rule, targetDate, period).status;
}

export function resolveAvailabilityStatus(
  calculatedStatus: AvailabilityStatus,
  manualOverride?: AvailabilityStatus,
) {
  return manualOverride ?? calculatedStatus;
}
