import { describe, expect, it } from "vitest";
import {
  addHangmanLetter,
  hangmanLetters,
  isHangmanWordComplete,
  normalizeHangmanText,
  revealHangmanWord,
} from "@/lib/games/hangman";

describe("forca", () => {
  it("normaliza acentos, caixa e espaços sem perder a palavra de exibição", () => {
    expect(normalizeHangmanText("  Pão   de Açúcar ")).toBe("PAO DE ACUCAR");
    expect(hangmanLetters("Pão")).toEqual(["P", "A", "O"]);
  });

  it("revela todas as ocorrências e mantém separadores visíveis", () => {
    expect(revealHangmanWord("Banana-da-terra", "ABN")).toBe("BANANA-_A-____A");
    expect(revealHangmanWord("Café", "CA")).toBe("CA__");
  });

  it("detecta conclusão e bloqueia letras repetidas ou inválidas", () => {
    expect(isHangmanWordComplete("CAFE", "EFAC")).toBe(true);
    expect(isHangmanWordComplete("CAFE", "CAF")).toBe(false);
    expect(addHangmanLetter("AB", "ç")).toBe("ABC");
    expect(() => addHangmanLetter("ABC", "c")).toThrow("já foi escolhida");
    expect(() => addHangmanLetter("", "12")).toThrow("somente uma letra");
  });
});
