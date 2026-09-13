import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  formatActivityScore,
  scoreChallengeActivity,
  MAX_ACTIVITY_PHOTO_BYTES,
} from "@/lib/challenge-activities";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { challengeConfigurationSchema } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import { prepareChallengePhotos } from "@/server/challenge-photos";
import { validateActivityEligibility } from "@/server/domain/challenge-activity";

const config = challengeConfigurationSchema.parse({
  version: 1,
  type: "FITNESS",
  scoring: { metric: "POINTS", pointsPerActivity: 10 },
});
const input = challengeActivitySchema.parse({
  clientRequestId: randomUUID(),
  title: "Corrida",
  activityType: "RUN",
  performedOn: "2026-12-31",
  durationSeconds: 601,
  distanceMeters: 1234,
});
const challenge = {
  startDate: new Date("2026-12-01"),
  endDate: new Date("2026-12-31"),
  timezone: "America/Sao_Paulo",
  cancelledAt: null,
};
const participant = { joinedAt: new Date("2026-12-30T03:00:00Z"), leftAt: null };
const now = new Date("2027-01-01T02:59:59Z");

describe("pontuação e critérios de treinos", () => {
  it("atribui pontos, segundos e metros e exibe uma casa decimal quando necessário", () => {
    expect(scoreChallengeActivity(config, input)).toBe(10);
    expect(scoreChallengeActivity({ ...config, scoring: { metric: "DURATION" } }, input)).toBe(601);
    expect(scoreChallengeActivity({ ...config, scoring: { metric: "DISTANCE" } }, input)).toBe(
      1234,
    );
    expect(formatActivityScore(3661, "DURATION")).toBe("1 h 1 min 1 s");
    expect(formatActivityScore(1234, "DISTANCE")).toBe("1,234 km");
    expect(formatActivityScore(20, "POINTS")).toBe("20 pts");
    expect(formatActivityScore(5.3, "POINTS")).toBe("5,3 pts");
  });
  it("aplica padrões explícitos a configurações antigas e valida limites", () => {
    expect(config.activityRules).toEqual({
      maxDailyActivities: 1,
      minDurationMinutes: 10,
      requirePhoto: true,
    });
    for (const change of [
      { maxDailyActivities: 0 },
      { maxDailyActivities: 11 },
      { minDurationMinutes: 0 },
      { minDurationMinutes: 1441 },
    ]) {
      expect(
        challengeConfigurationSchema.safeParse({
          ...config,
          activityRules: { ...config.activityRules, ...change },
        }).success,
      ).toBe(false);
    }
    for (const change of [
      { score: 999 },
      { durationSeconds: 0 },
      { durationSeconds: 86401 },
      { durationSeconds: 1.5 },
      { distanceMeters: -1 },
      { distanceMeters: 1000001 },
      { performedOn: "2026-02-30" },
    ])
      expect(challengeActivitySchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("inclui o último dia no fuso e bloqueia futuro, pré-inscrição e fim", () => {
    expect(() =>
      validateActivityEligibility(challenge, config, participant, input, 1, now),
    ).not.toThrow();
    for (const performedOn of ["2027-01-01", "2026-12-29", "2026-11-30"])
      expect(() =>
        validateActivityEligibility(
          challenge,
          config,
          participant,
          { ...input, performedOn },
          1,
          now,
        ),
      ).toThrow();
    expect(() =>
      validateActivityEligibility(
        challenge,
        config,
        participant,
        input,
        1,
        new Date("2027-01-01T03:00:00Z"),
      ),
    ).toThrow();
    expect(() =>
      validateActivityEligibility(
        challenge,
        config,
        participant,
        input,
        1,
        new Date("2026-11-30T12:00:00Z"),
      ),
    ).toThrow();
  });
  it("exige foto, duração, distância quando aplicável e participação ativa", () => {
    expect(() =>
      validateActivityEligibility(challenge, config, participant, input, 0, now),
    ).toThrow("foto");
    expect(() =>
      validateActivityEligibility(
        challenge,
        config,
        participant,
        { ...input, durationSeconds: 599 },
        1,
        now,
      ),
    ).toThrow("minutos");
    expect(() =>
      validateActivityEligibility(
        challenge,
        { ...config, scoring: { metric: "DISTANCE" } },
        participant,
        { ...input, distanceMeters: null },
        1,
        now,
      ),
    ).toThrow("distância");
    expect(() =>
      validateActivityEligibility(
        challenge,
        config,
        { ...participant, leftAt: now },
        input,
        1,
        now,
      ),
    ).toThrow();
    expect(() =>
      validateActivityEligibility(
        { ...challenge, cancelledAt: now },
        config,
        participant,
        input,
        1,
        now,
      ),
    ).toThrow();
  });
});

describe("fotos privadas de treinos", () => {
  it("decodifica, reduz, converte para WebP e remove metadados", async () => {
    const source = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "red" },
    })
      .withMetadata({ exif: { IFD0: { Copyright: "metadado de teste" } } })
      .jpeg()
      .toBuffer();
    const [photo] = await prepareChallengePhotos([new Uint8Array(source)]);
    const metadata = await sharp(photo).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1920);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });
  it("recusa conteúdo falso, SVG, excesso de fotos e tamanho", async () => {
    for (const photo of [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      ),
    ])
      await expect(prepareChallengePhotos([photo])).rejects.toMatchObject({ status: 400 });
    await expect(
      prepareChallengePhotos([new Uint8Array(MAX_ACTIVITY_PHOTO_BYTES + 1)]),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      prepareChallengePhotos(Array.from({ length: 4 }, () => new Uint8Array([1]))),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("limite real de multipart", () => {
  it("lê formulário válido e não depende de Content-Length", async () => {
    const form = new FormData();
    form.set("payload", "{}");
    const request = new Request("http://local/upload", { method: "POST", body: form });
    expect((await readBoundedFormData(request, 10000)).get("payload")).toBe("{}");
    for (const length of [undefined, "1", "99999"]) {
      const headers: Record<string, string> = {
        "content-type": "multipart/form-data; boundary=test",
      };
      if (length) headers["content-length"] = length;
      await expect(
        readBoundedFormData(
          new Request("http://local/upload", { method: "POST", headers, body: "x".repeat(101) }),
          100,
        ),
      ).rejects.toMatchObject({ status: 413 });
    }
  });
  it("recusa formulários malformados e tipos incorretos", async () => {
    await expect(
      readBoundedFormData(
        new Request("http://local/upload", {
          method: "POST",
          body: "abc",
          headers: { "content-type": "multipart/form-data" },
        }),
        100,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readBoundedFormData(new Request("http://local/upload", { method: "POST", body: "{}" }), 100),
    ).rejects.toMatchObject({ status: 415 });
  });
});
