const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CIVIL_MONTH = /^(\d{4})-(\d{2})$/;

export type DayPeriod = "ALL" | "MORNING" | "AFTERNOON" | "EVENING";

export function parseCivilDate(value: string) {
  const match = CIVIL_DATE.exec(value);
  if (!match) throw new Error(`Data civil inválida: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error(`Data civil inválida: ${value}`);
  return date;
}

export function formatCivilDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addCivilDays(value: string, amount: number) {
  const date = parseCivilDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatCivilDate(date);
}

export function isCivilMonth(value: string) {
  const match = CIVIL_MONTH.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function civilMonthRange(value: string) {
  if (!isCivilMonth(value)) throw new Error(`Mês civil inválido: ${value}`);
  const startDate = `${value}-01`;
  const start = parseCivilDate(startDate);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { startDate, endDate: formatCivilDate(end) };
}

export function addCivilMonths(value: string, amount: number) {
  if (!isCivilMonth(value)) throw new Error(`Mês civil inválido: ${value}`);
  const start = parseCivilDate(`${value}-01`);
  start.setUTCMonth(start.getUTCMonth() + amount);
  return formatCivilDate(start).slice(0, 7);
}

export function daysBetweenCivilDates(from: string, to: string) {
  return Math.round((parseCivilDate(to).getTime() - parseCivilDate(from).getTime()) / 86_400_000);
}

export function civilDateRange(startDate: string, endDate: string) {
  const days = daysBetweenCivilDates(startDate, endDate);
  if (days < 0) throw new Error("A data final deve ser igual ou posterior à inicial.");
  return Array.from({ length: days + 1 }, (_, index) => addCivilDays(startDate, index));
}

export function isWeekend(value: string) {
  const weekday = parseCivilDate(value).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function civilDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dateTimeLocalInTimeZone(value: Date, timeZone: string) {
  const parts = localPartsAt(value, timeZone);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function localPartsAt(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return {
    year: number("year"),
    month: number("month"),
    day: number("day"),
    hour: number("hour"),
    minute: number("minute"),
    second: number("second"),
  };
}

export function zonedDateTimeToUtc(civilDate: string, time: string, timeZone: string) {
  const date = parseCivilDate(civilDate);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!timeMatch) throw new Error(`Horário inválido: ${time}`);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`Horário inválido: ${time}`);

  const desired = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hour,
    minute,
    second,
  );
  let result = new Date(desired);

  // Two passes handle offsets and daylight-saving transitions without relying on the host timezone.
  for (let pass = 0; pass < 2; pass += 1) {
    const local = localPartsAt(result, timeZone);
    const representedAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    result = new Date(result.getTime() + (desired - representedAsUtc));
  }
  return result;
}

const periodTimes: Record<DayPeriod, [string, string]> = {
  ALL: ["00:00", "00:00"],
  MORNING: ["06:00", "12:00"],
  AFTERNOON: ["12:00", "18:00"],
  EVENING: ["18:00", "00:00"],
};

export function utcRangeForCivilDate(date: string, timeZone: string, period: DayPeriod = "ALL") {
  const [startTime, endTime] = periodTimes[period];
  const endDate = period === "ALL" || period === "EVENING" ? addCivilDays(date, 1) : date;
  return {
    start: zonedDateTimeToUtc(date, startTime, timeZone),
    end: zonedDateTimeToUtc(endDate, endTime, timeZone),
  };
}

export function intervalsOverlap(
  first: { start: Date; end: Date },
  second: { start: Date; end: Date },
) {
  return first.start < second.end && first.end > second.start;
}
