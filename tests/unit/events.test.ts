import { describe, expect, it } from "vitest";
import {
  assertEventAcceptsRsvp,
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

  it("aceita RSVP apenas em eventos publicados", () => {
    expect(() => assertEventAcceptsRsvp("PUBLISHED")).not.toThrow();
    expect(() => assertEventAcceptsRsvp("CANCELLED")).toThrow("EVENT_CANCELLED");
    expect(() => assertEventAcceptsRsvp("COMPLETED")).toThrow("EVENT_NOT_PUBLISHED");
    expect(() => assertEventAcceptsRsvp("DRAFT")).toThrow("EVENT_NOT_PUBLISHED");
  });
});
