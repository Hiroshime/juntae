import type { EventStatus, RsvpStatus } from "@prisma/client";

export type CalendarEventRsvpStatus = RsvpStatus | "NO_RESPONSE";

export type CommunityCalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  timezone: string;
  status: EventStatus;
  dates: string[];
  myRsvp: RsvpStatus | null;
  myAttendanceDates: string[];
};

export function calendarEventRsvpStatus(rsvp: RsvpStatus | null): CalendarEventRsvpStatus {
  return rsvp ?? "NO_RESPONSE";
}

export function calendarEventRsvpLabel(rsvp: RsvpStatus | null) {
  switch (rsvp) {
    case "GOING":
      return "Vou";
    case "MAYBE":
      return "Talvez";
    case "NOT_GOING":
      return "Não vou";
    default:
      return "Sem resposta";
  }
}

export function calendarEventRsvpClass(rsvp: RsvpStatus | null) {
  switch (rsvp) {
    case "GOING":
      return "calendar-event-rsvp-going";
    case "MAYBE":
      return "calendar-event-rsvp-maybe";
    case "NOT_GOING":
      return "calendar-event-rsvp-not-going";
    default:
      return "calendar-event-rsvp-no-response";
  }
}
