import { describe, expect, it } from "vitest";
import { eventSchema } from "@/lib/validation/event";

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

  it("aceita somente links HTTP ou HTTPS", () => {
    expect(
      eventSchema.safeParse({ ...validEvent, locationUrl: "https://example.com" }).success,
    ).toBe(true);
    expect(
      eventSchema.safeParse({ ...validEvent, locationUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
  });
});
