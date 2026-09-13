import { describe, expect, it } from "vitest";
import { challengeState, challengeScoringDescription } from "@/lib/challenges";
import { challengeConfigurationSchema, challengeSchema } from "@/lib/validation/challenge";

const input = {
  title: "Movimento",
  rules: "Caminhada e corrida ao ar livre.",
  startDate: "2028-02-29",
  endDate: "2028-03-29",
  timezone: "America/Sao_Paulo",
  configuration: {
    version: 1,
    type: "FITNESS",
    scoring: { metric: "POINTS", pointsPerActivity: 10 },
  },
};
describe("configuração de desafios", () => {
  it("aceita as três métricas e explica a comparação", () => {
    for (const metric of ["POINTS", "DURATION", "DISTANCE"]) {
      const parsed = challengeSchema.parse({
        ...input,
        configuration: {
          version: 1,
          type: "FITNESS",
          scoring: metric === "POINTS" ? { metric, pointsPerActivity: 10 } : { metric },
        },
      });
      expect(challengeScoringDescription(parsed.configuration)).toBeTruthy();
    }
  });
  it("valida datas reais, duração e fuso sem lançar exceções em safeParse", () => {
    expect(challengeSchema.safeParse(input).success).toBe(true);
    for (const changes of [
      { startDate: "2027-02-29" },
      { endDate: "invalida" },
      { endDate: "2028-02-28" },
      { endDate: "2029-03-01" },
      { timezone: "inventado" },
      { rules: "" },
      { title: " " },
    ])
      expect(challengeSchema.safeParse({ ...input, ...changes }).success).toBe(false);
    expect(challengeSchema.safeParse({ ...input, endDate: input.startDate }).success).toBe(true);
    expect(
      challengeSchema.safeParse({ ...input, startDate: "2028-01-01", endDate: "2028-12-31" })
        .success,
    ).toBe(true);
  });
  it("não aceita pontos inválidos nem configurações desconhecidas", () => {
    for (const pointsPerActivity of [0, -1, 1.5, 1001])
      expect(
        challengeConfigurationSchema.safeParse({
          ...input.configuration,
          scoring: { metric: "POINTS", pointsPerActivity },
        }).success,
      ).toBe(false);
    for (const changes of [
      { type: "READING" },
      { version: 2 },
      { secret: true },
      { scoring: { metric: "DISTANCE", pointsPerActivity: 10 } },
    ])
      expect(
        challengeConfigurationSchema.safeParse({ ...input.configuration, ...changes }).success,
      ).toBe(false);
  });
});

describe("ciclo de vida do desafio", () => {
  const challenge = {
    startDate: new Date("2026-12-31"),
    endDate: new Date("2027-01-01"),
    timezone: "America/Sao_Paulo",
    cancelledAt: null,
  };
  it.each([
    ["2026-12-31T02:59:59Z", "SCHEDULED"],
    ["2026-12-31T03:00:00Z", "ACTIVE"],
    ["2027-01-02T02:59:59Z", "ACTIVE"],
    ["2027-01-02T03:00:00Z", "ENDED"],
  ])("resolve %s como %s incluindo o último dia", (now, expected) => {
    expect(challengeState(challenge, new Date(now))).toBe(expected);
  });
  it("cancelamento prevalece e o fuso não depende do servidor", () => {
    expect(
      challengeState({ ...challenge, cancelledAt: new Date() }, new Date("2026-12-31T12:00:00Z")),
    ).toBe("CANCELLED");
    expect(
      challengeState({ ...challenge, timezone: "Asia/Tokyo" }, new Date("2026-12-30T15:00:00Z")),
    ).toBe("ACTIVE");
    const dst = {
      ...challenge,
      startDate: new Date("2027-03-14"),
      endDate: new Date("2027-03-14"),
      timezone: "America/New_York",
    };
    expect(challengeState(dst, new Date("2027-03-15T03:59:59Z"))).toBe("ACTIVE");
    expect(challengeState(dst, new Date("2027-03-15T04:00:00Z"))).toBe("ENDED");
  });
});
