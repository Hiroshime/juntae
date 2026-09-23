export const STOP_ALPHABET = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
export const STOP_REVIEW_SECONDS = 20;
export const STOP_EMPTY_REVIEW_SECONDS = 10;

export function stopReviewSeconds(hasAnswers: boolean) {
  return hasAnswers ? STOP_REVIEW_SECONDS : STOP_EMPTY_REVIEW_SECONDS;
}

export const DEFAULT_STOP_LETTERS = STOP_ALPHABET.filter(
  (letter) => !["K", "W", "Y"].includes(letter),
);

export const DEFAULT_STOP_CATEGORIES = [
  "Nome",
  "Animal",
  "Cor",
  "Comida",
  "Cidade",
  "Profissão",
  "Objeto",
  "Filme ou série",
];

export function normalizeStopText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export function stopAnswerStartsWithLetter(value: string, letter: string) {
  const normalizedValue = normalizeStopText(value);
  const normalizedLetter = normalizeStopText(letter);
  return normalizedValue.length > 0 && normalizedValue.startsWith(normalizedLetter);
}

export function stopInvalidVoteThreshold(playerCount: number) {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 10)
    throw new Error("Quantidade de jogadores inválida.");
  return Math.floor((playerCount - 1) / 2) + 1;
}

export function stopAnswerResult({
  value,
  letter,
  invalidVotes,
  playerCount,
}: {
  value: string;
  letter: string;
  invalidVotes: number;
  playerCount: number;
}) {
  if (!Number.isInteger(invalidVotes) || invalidVotes < 0)
    throw new Error("Quantidade de votos inválida.");
  const valid =
    stopAnswerStartsWithLetter(value, letter) &&
    invalidVotes < stopInvalidVoteThreshold(playerCount);
  return { valid, points: valid ? 1 : 0 };
}
