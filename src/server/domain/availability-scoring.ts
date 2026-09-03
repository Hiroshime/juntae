import type { AvailabilityStatus } from "@/server/domain/schedules";

export const availabilityScores: Record<AvailabilityStatus, number> = {
  AVAILABLE: 1,
  PARTIALLY_AVAILABLE: 0.5,
  WORKING: 0,
  DAY_OFF: 1,
  VACATION: 1,
  UNAVAILABLE: 0,
  UNKNOWN: 0,
};

export type AvailabilitySummary = {
  date: string;
  fullAvailableCount: number;
  partialAvailableCount: number;
  workingCount: number;
  unavailableCount: number;
  unknownCount: number;
  score: number;
  totalMembers: number;
  statusCounts: Record<AvailabilityStatus, number>;
};

export function summarizeAvailability(
  date: string,
  statuses: AvailabilityStatus[],
): AvailabilitySummary {
  const fullAvailableCount = statuses.filter((status) =>
    ["AVAILABLE", "DAY_OFF", "VACATION"].includes(status),
  ).length;
  const partialAvailableCount = statuses.filter(
    (status) => status === "PARTIALLY_AVAILABLE",
  ).length;
  const workingCount = statuses.filter((status) => status === "WORKING").length;
  const unavailableCount = statuses.filter((status) => status === "UNAVAILABLE").length;
  const unknownCount = statuses.filter((status) => status === "UNKNOWN").length;
  const score = statuses.reduce((total, status) => total + availabilityScores[status], 0);
  const statusCounts = Object.keys(availabilityScores).reduce(
    (counts, status) => ({
      ...counts,
      [status]: statuses.filter((item) => item === status).length,
    }),
    {} as Record<AvailabilityStatus, number>,
  );

  return {
    date,
    fullAvailableCount,
    partialAvailableCount,
    workingCount,
    unavailableCount,
    unknownCount,
    score,
    totalMembers: statuses.length,
    statusCounts,
  };
}

export function filterBestDates(
  summaries: AvailabilitySummary[],
  options: { minPeople?: number; onlyWeekends?: boolean },
) {
  return summaries.filter(
    (summary) =>
      (!options.onlyWeekends ||
        [0, 6].includes(new Date(`${summary.date}T00:00:00Z`).getUTCDay())) &&
      summary.fullAvailableCount >= (options.minPeople ?? 0),
  );
}

export function rankBestDates(summaries: AvailabilitySummary[]) {
  return [...summaries].sort(
    (a, b) =>
      b.score - a.score ||
      b.fullAvailableCount - a.fullAvailableCount ||
      a.unknownCount - b.unknownCount ||
      a.date.localeCompare(b.date),
  );
}
