import { describe, expect, it } from "vitest";
import {
  applyTicTacToeMove,
  evaluateTicTacToe,
  TIC_TAC_TOE_EMPTY_BOARD,
} from "@/lib/games/tic-tac-toe";

describe("jogo da velha", () => {
  it("aplica jogadas sem alterar outras casas", () => {
    expect(applyTicTacToeMove(TIC_TAC_TOE_EMPTY_BOARD, 4, "X")).toBe("----X----");
    expect(applyTicTacToeMove("X--------", 8, "O")).toBe("X-------O");
  });

  it("detecta vitórias nas linhas, colunas e diagonais", () => {
    expect(evaluateTicTacToe("XXXOO----")).toMatchObject({
      winner: "X",
      winningLine: [0, 1, 2],
    });
    expect(evaluateTicTacToe("XO-XO--O-")).toMatchObject({
      winner: "O",
      winningLine: [1, 4, 7],
    });
    expect(evaluateTicTacToe("XOO-X---X")).toMatchObject({
      winner: "X",
      winningLine: [0, 4, 8],
    });
  });

  it("detecta empate e rejeita casa ocupada ou tabuleiro inválido", () => {
    expect(evaluateTicTacToe("XOXXOOOXX")).toEqual({
      winner: null,
      winningLine: null,
      draw: true,
    });
    expect(() => applyTicTacToeMove("X--------", 0, "O")).toThrow("já foi marcada");
    expect(() => evaluateTicTacToe("---------X")).toThrow("Tabuleiro inválido");
  });
});
