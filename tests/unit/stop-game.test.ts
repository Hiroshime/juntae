import { describe, expect, it } from "vitest";
import {
  normalizeStopText,
  stopAnswerResult,
  stopAnswerStartsWithLetter,
  stopInvalidVoteThreshold,
  stopReviewSeconds,
} from "@/lib/games/stop-game";
import { stopRulesSchema } from "@/lib/validation/games";

const categories = ["Nome", "Animal", "Cor", "Comida", "Cidade", "Profissão", "Objeto", "Filme"];

describe("Stop da Turma", () => {
  it("normaliza acentos e aceita a letra equivalente", () => {
    expect(normalizeStopText("  água   doce ")).toBe("AGUA DOCE");
    expect(stopAnswerStartsWithLetter("Águia", "A")).toBe(true);
    expect(stopAnswerStartsWithLetter("banana", "A")).toBe(false);
  });

  it("exige maioria dos outros jogadores para invalidar", () => {
    expect(stopInvalidVoteThreshold(2)).toBe(1);
    expect(stopInvalidVoteThreshold(3)).toBe(2);
    expect(stopInvalidVoteThreshold(10)).toBe(5);
    expect(() => stopInvalidVoteThreshold(1)).toThrow("Quantidade de jogadores inválida");
  });

  it("atribui um ponto apenas para resposta com letra correta e sem maioria contrária", () => {
    expect(
      stopAnswerResult({ value: "Avestruz", letter: "A", invalidVotes: 1, playerCount: 4 }),
    ).toEqual({ valid: true, points: 1 });
    expect(
      stopAnswerResult({ value: "Avestruz", letter: "A", invalidVotes: 2, playerCount: 4 }),
    ).toEqual({ valid: false, points: 0 });
    expect(
      stopAnswerResult({ value: "Coelho", letter: "A", invalidVotes: 0, playerCount: 4 }),
    ).toEqual({ valid: false, points: 0 });
  });

  it("reduz a revisão de categorias sem respostas para dez segundos", () => {
    expect(stopReviewSeconds(false)).toBe(10);
    expect(stopReviewSeconds(true)).toBe(20);
  });

  it("valida jogadores, rodadas, tempo, letras e no mínimo oito categorias", () => {
    expect(
      stopRulesSchema.parse({
        version: 1,
        maxPlayers: 10,
        roundCount: 6,
        answerSeconds: 20,
        letters: ["A", "B"],
        categories,
      }),
    ).toMatchObject({ maxPlayers: 10, roundCount: 6, answerSeconds: 20 });
    expect(
      stopRulesSchema.safeParse({
        version: 1,
        maxPlayers: 11,
        roundCount: 3,
        answerSeconds: 18,
        letters: ["A", "A"],
        categories: categories.slice(0, 7),
      }).success,
    ).toBe(false);
    expect(
      stopRulesSchema.safeParse({
        version: 1,
        maxPlayers: 4,
        roundCount: 4,
        answerSeconds: 15,
        letters: ["A"],
        categories: [...categories.slice(0, 7), "Nôme"],
      }).success,
    ).toBe(false);
  });
});
