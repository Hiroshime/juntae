const LETTER = /\p{L}/u;

export const HANGMAN_PARTS = [
  "Cabeça",
  "Corpo",
  "Braço direito",
  "Braço esquerdo",
  "Perna direita",
  "Perna esquerda",
  "Olhos",
  "Boca",
  "Nariz",
  "Cabelo",
] as const;

export function normalizeHangmanText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleUpperCase("pt-BR");
}

export function hangmanLetters(value: string) {
  return Array.from(
    new Set(Array.from(normalizeHangmanText(value)).filter((char) => LETTER.test(char))),
  );
}

export function revealHangmanWord(secretWord: string, guessedLetters: string) {
  const guessed = new Set(Array.from(guessedLetters));
  return Array.from(secretWord)
    .map((char) => {
      const normalized = normalizeHangmanText(char);
      if (!LETTER.test(normalized)) return char;
      return guessed.has(normalized) ? char.toLocaleUpperCase("pt-BR") : "_";
    })
    .join("");
}

export function isHangmanWordComplete(normalizedWord: string, guessedLetters: string) {
  const guessed = new Set(Array.from(guessedLetters));
  return hangmanLetters(normalizedWord).every((letter) => guessed.has(letter));
}

export function addHangmanLetter(guessedLetters: string, value: string) {
  const letter = normalizeHangmanText(value);
  if (Array.from(letter).length !== 1 || !LETTER.test(letter))
    throw new Error("Informe somente uma letra.");
  if (guessedLetters.includes(letter)) throw new Error("Esta letra já foi escolhida.");
  return `${guessedLetters}${letter}`;
}
