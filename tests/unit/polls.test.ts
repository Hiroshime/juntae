import { describe, expect, it } from "vitest";
import {
  assertPollAcceptsVotes,
  effectivePollStatus,
  summarizePollResults,
  validateVoteSelection,
} from "@/server/domain/polls";

describe("poll domain", () => {
  it("considera encerrada por status ou prazo", () => {
    const now = new Date("2030-09-10T12:00:00.000Z");
    expect(effectivePollStatus("OPEN", null, now)).toBe("OPEN");
    expect(effectivePollStatus("CLOSED", null, now)).toBe("CLOSED");
    expect(effectivePollStatus("OPEN", new Date("2030-09-10T11:59:00.000Z"), now)).toBe("CLOSED");
    expect(() =>
      assertPollAcceptsVotes(
        { status: "OPEN", closesAt: new Date("2030-09-10T11:59:00.000Z") },
        now,
      ),
    ).toThrow("POLL_CLOSED");
  });

  it("exige exatamente uma opção em escolha única", () => {
    expect(() => validateVoteSelection("SINGLE_CHOICE", ["a"])).not.toThrow();
    expect(() => validateVoteSelection("SINGLE_CHOICE", ["a", "b"])).toThrow(
      "SINGLE_CHOICE_REQUIRES_ONE",
    );
    expect(() => validateVoteSelection("MULTIPLE_CHOICE", ["a", "b"])).not.toThrow();
    expect(() => validateVoteSelection("DATE_OPTIONS", ["a", "b"])).not.toThrow();
    expect(() => validateVoteSelection("MULTIPLE_CHOICE", ["a", "a"])).toThrow(
      "INVALID_VOTE_SELECTION",
    );
  });

  it("calcula votantes únicos, votos e percentual por opção", () => {
    expect(
      summarizePollResults([
        { id: "a", votes: [{ userId: "u1" }, { userId: "u2" }] },
        { id: "b", votes: [{ userId: "u1" }] },
        { id: "c", votes: [] },
      ]),
    ).toEqual({
      totalVoters: 2,
      options: [
        { optionId: "a", voteCount: 2, percentage: 100 },
        { optionId: "b", voteCount: 1, percentage: 50 },
        { optionId: "c", voteCount: 0, percentage: 0 },
      ],
    });
  });
});
