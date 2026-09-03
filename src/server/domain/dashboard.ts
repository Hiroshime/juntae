import { addCivilDays, parseCivilDate } from "@/lib/dates/civil-date";
import { rankBestDates, type AvailabilitySummary } from "@/server/domain/availability-scoring";

export function nextWeekendDates(fromDate: string) {
  const weekday = parseCivilDate(fromDate).getUTCDay();
  const daysUntilSaturday = (6 - weekday + 7) % 7;
  const saturday = addCivilDays(fromDate, daysUntilSaturday);
  return { saturday, sunday: addCivilDays(saturday, 1) };
}

export function selectBestOpportunities(summaries: AvailabilitySummary[], take = 3) {
  return rankBestDates(summaries).slice(0, Math.max(0, take));
}
