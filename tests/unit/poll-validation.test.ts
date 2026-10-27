import { describe, expect, it } from "vitest";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import {
  addPollOptionSchema,
  castVoteSchema,
  createPollSchema,
  updatePollSchema,
} from "@/lib/validation/poll";

const base = {
  title: "Próximo passeio",
  description: "",
  allowVoteChange: true,
  closesAt: null,
};

describe("poll validation", () => {
  const grouped = {
    ...base,
    type: "GROUPED",
    questions: [
      { title: "Almoço", type: "SINGLE_CHOICE", options: ["Churrasco", "Macarrão"] },
      { title: "Jantar", type: "MULTIPLE_CHOICE", options: ["Pizza", "Macarrão"] },
    ],
  };

  it("valida perguntas independentes e permite a mesma alternativa em perguntas diferentes", () => {
    const parsed = createPollSchema.parse({ ...grouped, allowMemberOptions: true });
    expect(parsed).toMatchObject({
      allowMemberOptions: true,
      questions: [
        { options: [{ label: "Churrasco" }, { label: "Macarrão" }] },
        { title: "Jantar" },
      ],
    });
    expect(
      createPollSchema.safeParse({ ...grouped, questions: [grouped.questions[0]] }).success,
    ).toBe(false);
    expect(
      createPollSchema.safeParse({
        ...grouped,
        questions: [grouped.questions[0], { ...grouped.questions[1], title: " almoço " }],
      }).success,
    ).toBe(false);
    expect(
      createPollSchema.safeParse({
        ...grouped,
        questions: [grouped.questions[0], { ...grouped.questions[1], options: ["Pizza", "pizza"] }],
      }).success,
    ).toBe(false);
    expect(
      createPollSchema.safeParse({
        ...grouped,
        questions: [grouped.questions[0], { ...grouped.questions[1], type: "DATE_OPTIONS" }],
      }).success,
    ).toBe(false);
  });

  it("valida sugestões, configuração booleana e identificador da pergunta", () => {
    expect(addPollOptionSchema.parse({ label: " Yakisoba " })).toMatchObject({ label: "Yakisoba" });
    expect(addPollOptionSchema.safeParse({ label: " " }).success).toBe(false);
    expect(addPollOptionSchema.safeParse({ label: "Teste", questionId: "bad" }).success).toBe(
      false,
    );
    expect(
      addPollOptionSchema.safeParse({ label: "Teste", websiteUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(addPollOptionSchema.safeParse({ label: "Data", dateValue: "2030-02-30" }).success).toBe(
      false,
    );
    expect(
      castVoteSchema.safeParse({
        optionIds: ["b0d93d29-9ccc-4f65-a746-daa5e5f1978e"],
        questionId: "bad",
      }).success,
    ).toBe(false);
    expect(createPollSchema.safeParse({ ...grouped, allowMemberOptions: "true" }).success).toBe(
      false,
    );
    expect(updatePollSchema.parse(base).allowMemberOptions).toBeUndefined();
  });
  it("normaliza votação simples e rejeita opções repetidas", () => {
    expect(
      createPollSchema.parse({
        ...base,
        type: "SINGLE_CHOICE",
        options: ["Parque", "Cinema"],
      }),
    ).toMatchObject({
      description: null,
      options: [{ label: "Parque" }, { label: "Cinema" }],
    });
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "MULTIPLE_CHOICE",
        options: ["Cinema", "cinema"],
      }).success,
    ).toBe(false);
  });

  it("valida detalhes opcionais e bloqueia links inseguros", () => {
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "SINGLE_CHOICE",
        options: [
          {
            label: "Chácara",
            description: "Com piscina",
            imageUrl: "https://example.com/foto.jpg",
            websiteUrl: "https://example.com",
            location: "Campinas, SP",
          },
          "Praia",
        ],
      }).success,
    ).toBe(true);
    expect(
      createPollSchema.safeParse({
        ...base,
        type: "SINGLE_CHOICE",
        options: [{ label: "Chácara", websiteUrl: "javascript:alert(1)" }, "Praia"],
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
