import { describe, expect, it } from "vitest";
import {
  calendarEventRsvpClass,
  calendarEventRsvpLabel,
  calendarEventRsvpStatus,
} from "@/lib/calendar-events";

describe("status de eventos no calendário", () => {
  it("diferencia resposta registrada de ausência de resposta", () => {
    expect(calendarEventRsvpStatus(null)).toBe("NO_RESPONSE");
    expect(calendarEventRsvpStatus("GOING")).toBe("GOING");
    expect(calendarEventRsvpLabel(null)).toBe("Sem resposta");
    expect(calendarEventRsvpLabel("MAYBE")).toBe("Talvez");
  });

  it("mantém classes visuais estáveis para a legenda do calendário", () => {
    expect(calendarEventRsvpClass("GOING")).toBe("calendar-event-rsvp-going");
    expect(calendarEventRsvpClass("MAYBE")).toBe("calendar-event-rsvp-maybe");
    expect(calendarEventRsvpClass("NOT_GOING")).toBe("calendar-event-rsvp-not-going");
    expect(calendarEventRsvpClass(null)).toBe("calendar-event-rsvp-no-response");
  });
});
