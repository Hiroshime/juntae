export const TIC_TAC_TOE_EMPTY_BOARD = "---------";
export type TicTacToeMark = "X" | "O";

export const TIC_TAC_TOE_WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function isValidTicTacToeBoard(board: string) {
  return /^[XO-]{9}$/.test(board);
}

export function evaluateTicTacToe(board: string) {
  if (!isValidTicTacToeBoard(board)) throw new Error("Tabuleiro inválido.");
  for (const line of TIC_TAC_TOE_WINNING_LINES) {
    const [first, second, third] = line;
    const mark = board[first];
    if (mark !== "-" && mark === board[second] && mark === board[third])
      return { winner: mark as TicTacToeMark, winningLine: [...line], draw: false };
  }
  return {
    winner: null,
    winningLine: null,
    draw: !board.includes("-"),
  };
}

export function applyTicTacToeMove(board: string, cell: number, mark: TicTacToeMark) {
  if (!isValidTicTacToeBoard(board)) throw new Error("Tabuleiro inválido.");
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error("Casa inválida.");
  if (board[cell] !== "-") throw new Error("Esta casa já foi marcada.");
  return `${board.slice(0, cell)}${mark}${board.slice(cell + 1)}`;
}

export function oppositeTicTacToeMark(mark: TicTacToeMark): TicTacToeMark {
  return mark === "X" ? "O" : "X";
}
