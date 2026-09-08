import { describe, expect, it } from "vitest";
import { eventSchema, rsvpSchema } from "@/lib/validation/event";

const validEvent = {
  title: "Jantar",
  description: "",
  startsAt: "2030-09-10T22:00:00.000Z",
  endsAt: "2030-09-11T01:00:00.000Z",
  allDay: false,
  timezone: "America/Sao_Paulo",
  locationName: "",
  locationAddress: "",
  locationUrl: "",
  estimatedCost: null,
  currency: "BRL",
  participantLimit: null,
  allowMaybe: true,
  allowPartialAttendance: false,
};

describe("event validation", () => {
  it("aceita campos opcionais vazios e os normaliza", () => {
    expect(eventSchema.parse(validEvent)).toMatchObject({
      description: null,
      locationName: null,
      locationAddress: null,
      locationUrl: null,
    });
  });

  it("aceita escolha de dias somente em eventos com mais de um dia", () => {
    expect(
      eventSchema.safeParse({
        ...validEvent,
        endsAt: "2030-09-13T01:00:00.000Z",
        allowPartialAttendance: true,
      }).success,
    ).toBe(true);
    expect(eventSchema.safeParse({ ...validEvent, allowPartialAttendance: true }).success).toBe(
      false,
    );
  });

  it("aceita somente links HTTP ou HTTPS", () => {
    expect(
      eventSchema.safeParse({ ...validEvent, locationUrl: "https://example.com" }).success,
    ).toBe(true);
    expect(
      eventSchema.safeParse({ ...validEvent, locationUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });

  it("valida as datas opcionais da resposta", () => {
    expect(
      rsvpSchema.parse({ status: "GOING", attendanceDates: ["2030-11-22", "2030-11-23"] }),
    ).toEqual({ status: "GOING", attendanceDates: ["2030-11-22", "2030-11-23"] });
    expect(
      rsvpSchema.safeParse({ status: "NOT_GOING", attendanceDates: ["2030-11-22"] }).success,
    ).toBe(false);
    expect(
      rsvpSchema.safeParse({ status: "GOING", attendanceDates: ["2030-11-22", "2030-11-22"] })
        .success,
    ).toBe(false);
  });
});
