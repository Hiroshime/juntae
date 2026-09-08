import { describe, expect, it } from "vitest";
import {
  assertEventAcceptsRsvp,
  estimatedCostPerConfirmed,
  eventAttendanceDates,
  remainingParticipantSpots,
  summarizeRsvps,
} from "@/server/domain/events";

describe("event domain", () => {
  it("resume respostas sem misturar os estados", () => {
    expect(summarizeRsvps(["GOING", "MAYBE", "GOING", "NOT_GOING"])).toEqual({
      GOING: 2,
      MAYBE: 1,
      NOT_GOING: 1,
      totalResponses: 4,
    });
  });

  it("trata o limite como indicador e nunca retorna vagas negativas", () => {
    expect(remainingParticipantSpots(null, 10)).toBeNull();
    expect(remainingParticipantSpots(3, 2)).toBe(1);
    expect(remainingParticipantSpots(3, 5)).toBe(0);
  });

  it("calcula o custo estimado apenas entre participantes confirmados", () => {
    expect(estimatedCostPerConfirmed(120, 3)).toBe(40);
    expect(estimatedCostPerConfirmed(100, 3)).toBeCloseTo(33.3333);
    expect(estimatedCostPerConfirmed(120, 0)).toBeNull();
    expect(estimatedCostPerConfirmed(null, 3)).toBeNull();
  });

  it("aceita RSVP apenas em eventos publicados", () => {
    expect(() => assertEventAcceptsRsvp("PUBLISHED")).not.toThrow();
    expect(() => assertEventAcceptsRsvp("CANCELLED")).toThrow("EVENT_CANCELLED");
    expect(() => assertEventAcceptsRsvp("COMPLETED")).toThrow("EVENT_NOT_PUBLISHED");
    expect(() => assertEventAcceptsRsvp("DRAFT")).toThrow("EVENT_NOT_PUBLISHED");
  });

  it("lista as datas civis inclusivas do evento e respeita término exclusivo", () => {
    expect(
      eventAttendanceDates({
        startsAt: new Date("2030-11-20T03:00:00.000Z"),
        endsAt: new Date("2030-11-24T03:00:00.000Z"),
        timezone: "America/Sao_Paulo",
      }),
    ).toEqual(["2030-11-20", "2030-11-21", "2030-11-22", "2030-11-23"]);
  });
});
