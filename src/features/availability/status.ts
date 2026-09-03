import type { AvailabilityStatus } from "@prisma/client";

export const availabilityStatusLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE: "Disponível",
  PARTIALLY_AVAILABLE: "Parcialmente disponível",
  WORKING: "Trabalhando",
  DAY_OFF: "Folga",
  VACATION: "Férias",
  UNAVAILABLE: "Indisponível",
  UNKNOWN: "Sem informação",
};

export const availabilityStatusSymbols: Record<AvailabilityStatus, string> = {
  AVAILABLE: "✓",
  PARTIALLY_AVAILABLE: "◐",
  WORKING: "▣",
  DAY_OFF: "☀",
  VACATION: "✦",
  UNAVAILABLE: "×",
  UNKNOWN: "?",
};

export const editableAvailabilityStatuses = [
  "AVAILABLE",
  "PARTIALLY_AVAILABLE",
  "WORKING",
  "DAY_OFF",
  "VACATION",
  "UNAVAILABLE",
] as const;

export function statusClass(status: AvailabilityStatus) {
  return `availability-${status.toLowerCase().replaceAll("_", "-")}`;
}
