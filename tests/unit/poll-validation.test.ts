import { describe, expect, it } from "vitest";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { createPollSchema } from "@/lib/validation/poll";

const base = {
  title: "Próximo passeio",
  description: "",
  allowVoteChange: true,
  closesAt: null,
};

describe("poll validation", () => {
  it("normaliza votação simples e rejeita opções repetidas", () => {
    expect(
      createPollSchema.parse({
        ...base,
        type: "SINGLE_CHOICE",
        options: ["Parque", "Cinema"],
      }),
    ).toMatchObject({ description: null, options: ["Parque", "Cinema"] });
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "MULTIPLE_CHOICE",
        options: ["Cinema", "cinema"],
      }).success,
    ).toBe(false);
  });

  it("aceita datas futuras distintas dentro de um ano", () => {
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "DATE_OPTIONS",
        dates: [addCivilDays(today, 1), addCivilDays(today, 30)],
      }).success,
    ).toBe(true);
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "DATE_OPTIONS",
        dates: [addCivilDays(today, 1), addCivilDays(today, 400)],
      }).success,
    ).toBe(false);
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "DATE_OPTIONS",
        dates: [],
      }).success,
    ).toBe(false);
  });

  it("avalia data civil no timezone informado e não pelo dia UTC", () => {
    const today = civilDateInTimeZone(new Date(), "America/Sao_Paulo");
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "DATE_OPTIONS",
        timezone: "America/Sao_Paulo",
        dates: [today, addCivilDays(today, 1)],
      }).success,
    ).toBe(true);
  });
});
