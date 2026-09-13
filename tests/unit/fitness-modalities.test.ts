import { describe, expect, it } from "vitest";
import { challengeConfigurationSchema } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import {
  fitnessModalityLabels,
  formatModalityScoring,
  getChallengeModalities,
} from "@/lib/fitness-modalities";
import { scoreChallengeActivity } from "@/lib/challenge-activities";

const legacy = { version: 1, type: "FITNESS", scoring: { metric: "POINTS", pointsPerActivity: 7 } };
const run = { id: "RUN", label: "Corrida", points: 20 };
const custom = { id: "CUSTOM_1234567890abcdef12345678", label: "Beach tennis", points: 15 };
describe("modalidades fitness", () => {
  it("preserva opções e pontos antigos sem ampliar silenciosamente o catálogo", () => {
    const config = challengeConfigurationSchema.parse(legacy);
    expect(getChallengeModalities(config)).toHaveLength(7);
    expect(getChallengeModalities(config).every((item) => item.points === 7)).toBe(true);
    expect(getChallengeModalities(config).some((item) => item.id === "PILATES")).toBe(false);
    expect(
      scoreChallengeActivity(config, {
        activityType: "RUN",
        durationSeconds: 600,
        distanceMeters: 1000,
      }),
    ).toBe(7);
  });
  it("aceita catálogo completo e personalizadas com IDs compatíveis com a coluna existente", () => {
    const modalities = [
      ...Object.entries(fitnessModalityLabels).map(([id, label]) => ({ id, label, points: 10 })),
      custom,
    ];
    expect(challengeConfigurationSchema.safeParse({ ...legacy, modalities }).success).toBe(true);
    expect(modalities.every((item) => item.id.length <= 32)).toBe(true);
  });
  it("valida lista, IDs, nomes duplicados e limites de pontos", () => {
    for (const modalities of [
      [],
      [run, run],
      [custom, { ...custom, id: "CUSTOM_aaaaaaaaaaaaaaaaaaaaaaaa", label: " beach   TÉNNIS " }],
      [{ ...run, id: "INVALID" }],
      [{ ...run, id: "__proto__" }],
      [{ ...run, label: "Outro nome" }],
      [{ ...custom, label: " " }],
      [{ ...custom, label: "x".repeat(61) }],
      ...[0, -1, 0.5, 1001].map((points) => [{ ...run, points }]),
      Array.from({ length: 41 }, () => run),
    ])
      expect(challengeConfigurationSchema.safeParse({ ...legacy, modalities }).success).toBe(false);
  });
  it("calcula pontos distintos sem alterar soma de tempo ou distância", () => {
    const config = challengeConfigurationSchema.parse({ ...legacy, modalities: [run, custom] });
    for (const item of [run, custom]) {
      const activity = { activityType: item.id, durationSeconds: 1800, distanceMeters: 3000 };
      expect(scoreChallengeActivity(config, activity)).toBe(item.points);
      expect(scoreChallengeActivity({ ...config, scoring: { metric: "DURATION" } }, activity)).toBe(
        1800,
      );
      expect(scoreChallengeActivity({ ...config, scoring: { metric: "DISTANCE" } }, activity)).toBe(
        3000,
      );
    }
    expect(() =>
      scoreChallengeActivity(config, {
        activityType: "WALK",
        durationSeconds: 600,
        distanceMeters: 0,
      }),
    ).toThrow("Modalidade não habilitada");
    expect(challengeActivitySchema.safeParse({ activityType: "RUN", points: 999 }).success).toBe(
      false,
    );
  });
  it("calcula pontos proporcionais de tempo e distância com uma casa decimal", () => {
    const duration = {
      ...run,
      points: 5,
      pointsPerMetric: { metric: "DURATION" as const, unitValue: 180 },
    };
    const distance = {
      ...custom,
      points: 3,
      pointsPerMetric: { metric: "DISTANCE" as const, unitValue: 1000 },
    };
    const config = challengeConfigurationSchema.parse({
      ...legacy,
      modalities: [duration, distance],
    });
    expect(
      scoreChallengeActivity(config, {
        activityType: "RUN",
        durationSeconds: 601,
        distanceMeters: null,
      }),
    ).toBe(16.7);
    expect(
      scoreChallengeActivity(config, {
        activityType: custom.id,
        durationSeconds: 600,
        distanceMeters: 3200,
      }),
    ).toBe(9.6);
    expect(
      scoreChallengeActivity(
        challengeConfigurationSchema.parse({
          ...legacy,
          modalities: [{ ...distance, points: 5 }],
        }),
        { activityType: custom.id, durationSeconds: 600, distanceMeters: 1060 },
      ),
    ).toBe(5.3);
    expect(formatModalityScoring(duration)).toBe("5 pts a cada 3 min");
    expect(formatModalityScoring(distance)).toBe("3 pts a cada 1 km");
    expect(
      challengeConfigurationSchema.safeParse({
        ...legacy,
        modalities: [{ ...duration, pointsPerMetric: { metric: "DURATION", unitValue: 61 } }],
      }).success,
    ).toBe(false);
    expect(
      challengeConfigurationSchema.safeParse({
        ...legacy,
        modalities: [{ ...distance, pointsPerMetric: { metric: "DISTANCE", unitValue: 0 } }],
      }).success,
    ).toBe(false);
  });
});
