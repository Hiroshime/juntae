import { civilDateInTimeZone, civilDateRange } from "@/lib/dates/civil-date";

export const rsvpStatuses = ["GOING", "MAYBE", "NOT_GOING"] as const;
export type RsvpStatus = (typeof rsvpStatuses)[number];

export type RsvpSummary = Record<RsvpStatus, number> & { totalResponses: number };

export function summarizeRsvps(statuses: RsvpStatus[]): RsvpSummary {
  return {
    GOING: statuses.filter((status) => status === "GOING").length,
    MAYBE: statuses.filter((status) => status === "MAYBE").length,
    NOT_GOING: statuses.filter((status) => status === "NOT_GOING").length,
    totalResponses: statuses.length,
  };
}

export function remainingParticipantSpots(limit: number | null, goingCount: number) {
  return limit == null ? null : Math.max(0, limit - goingCount);
}

export function estimatedCostPerConfirmed(estimatedCost: number | null, goingCount: number) {
  if (estimatedCost == null || goingCount <= 0) return null;
  return estimatedCost / goingCount;
}

export function assertEventAcceptsRsvp(status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED") {
  if (status === "CANCELLED") throw new Error("EVENT_CANCELLED");
  if (status !== "PUBLISHED") throw new Error("EVENT_NOT_PUBLISHED");
}

export function eventAttendanceDates(event: {
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
}) {
  const startDate = civilDateInTimeZone(event.startsAt, event.timezone);
  const effectiveEnd = event.endsAt ? new Date(event.endsAt.getTime() - 1) : event.startsAt;
  const endDate = civilDateInTimeZone(effectiveEnd, event.timezone);
  return civilDateRange(startDate, endDate);
}
