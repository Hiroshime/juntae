import type { EventStatus, RsvpStatus } from "@prisma/client";

export const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluído",
};

export const rsvpStatusLabels: Record<RsvpStatus, string> = {
  GOING: "Vou",
  MAYBE: "Talvez",
  NOT_GOING: "Não vou",
};

export function eventStatusClass(status: EventStatus) {
  return status === "CANCELLED"
    ? "event-status-cancelled"
    : status === "COMPLETED"
      ? "event-status-completed"
      : "event-status-published";
}

export function formatEventDate(
  event: { startsAt: Date; endsAt: Date | null; allDay: boolean; timezone: string },
  locale = "pt-BR",
) {
  const start = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(event.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    timeZone: event.timezone,
  }).format(event.startsAt);
  if (!event.endsAt) return start;
  const end = new Intl.DateTimeFormat(locale, {
    ...(event.allDay
      ? { day: "2-digit", month: "long", year: "numeric" }
      : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    timeZone: event.timezone,
  }).format(event.allDay ? new Date(event.endsAt.getTime() - 1) : event.endsAt);
  return `${start} até ${end}`;
}
