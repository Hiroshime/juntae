import { z } from "zod";
import { DEFAULT_STOP_CATEGORIES, DEFAULT_STOP_LETTERS } from "@/lib/games/stop-game";

export const ticTacToeRulesSchema = z
  .object({
    version: z.literal(1).default(1),
    starterMode: z.enum(["ALTERNATE", "RANDOM"]).default("ALTERNATE"),
  })
  .strict();

export const hangmanRulesSchema = z
  .object({
    version: z.literal(1).default(1),
    wordCount: z.number().int().min(1).max(20).default(5),
  })
  .strict();

const stopCategorySchema = z.string().trim().min(2).max(60);

export const stopRulesSchema = z
  .object({
    version: z.literal(1).default(1),
    maxPlayers: z.number().int().min(2).max(10).default(10),
    roundCount: z.number().int().min(4).max(10).default(6),
    answerSeconds: z
      .union([z.literal(15), z.literal(20), z.literal(25), z.literal(30)])
      .default(20),
    letters: z
      .array(z.string().regex(/^[A-Z]$/))
      .min(1)
      .max(26)
      .default(DEFAULT_STOP_LETTERS),
    categories: z.array(stopCategorySchema).min(8).max(20).default(DEFAULT_STOP_CATEGORIES),
  })
  .strict()
  .superRefine((rules, context) => {
    if (new Set(rules.letters).size !== rules.letters.length)
      context.addIssue({ code: "custom", path: ["letters"], message: "Não repita letras." });
    const normalizedCategories = rules.categories.map((category) =>
      category
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR"),
    );
    if (new Set(normalizedCategories).size !== normalizedCategories.length)
      context.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Não repita categorias.",
      });
  });

const roomNameSchema = z.string().trim().min(2, "Informe um nome para a sala.").max(80);

export const createGameRoomSchema = z.discriminatedUnion("gameType", [
  z
    .object({
      gameType: z.literal("TIC_TAC_TOE"),
      name: roomNameSchema,
      rules: ticTacToeRulesSchema,
    })
    .strict(),
  z
    .object({
      gameType: z.literal("HANGMAN"),
      name: roomNameSchema,
      rules: hangmanRulesSchema,
    })
    .strict(),
  z
    .object({
      gameType: z.literal("STOP"),
      name: roomNameSchema,
      rules: stopRulesSchema,
    })
    .strict(),
]);

export const gameRulesSchema = z.union([ticTacToeRulesSchema, hangmanRulesSchema, stopRulesSchema]);

export const gameRoomActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("JOIN") }).strict(),
  z.object({ action: z.literal("LEAVE") }).strict(),
  z.object({ action: z.literal("SET_READY"), ready: z.boolean() }).strict(),
  z.object({ action: z.literal("UPDATE_RULES"), rules: gameRulesSchema }).strict(),
  z.object({ action: z.literal("CLOSE") }).strict(),
  z.object({ action: z.literal("REOPEN") }).strict(),
]);

export const ticTacToeMoveSchema = z
  .object({
    matchId: z.string().uuid(),
    cell: z.number().int().min(0).max(8),
  })
  .strict();

const hangmanWordValueSchema = z
  .string()
  .trim()
  .min(2, "A palavra precisa ter ao menos duas letras.")
  .max(80)
  .regex(
    /^\p{L}+(?:[ '\-]\p{L}+)*$/u,
    "Use somente letras, espaços, hífen ou apóstrofo na palavra.",
  );

export const hangmanSecretSchema = z
  .object({
    roundId: z.string().uuid(),
    word: hangmanWordValueSchema,
    clue: z.string().trim().max(160).optional().default(""),
  })
  .strict();

export const hangmanGuessSchema = z.discriminatedUnion("type", [
  z
    .object({
      roundId: z.string().uuid(),
      type: z.literal("LETTER"),
      value: z
        .string()
        .trim()
        .refine((value) => Array.from(value).length === 1 && /^\p{L}$/u.test(value), {
          message: "Informe somente uma letra.",
        }),
    })
    .strict(),
  z
    .object({
      roundId: z.string().uuid(),
      type: z.literal("WORD"),
      value: hangmanWordValueSchema,
    })
    .strict(),
]);

export const stopGameActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("SAVE_ANSWERS"),
      roundId: z.string().uuid(),
      answers: z
        .array(
          z.object({ categoryId: z.string().uuid(), value: z.string().trim().max(80) }).strict(),
        )
        .max(20),
    })
    .strict(),
  z.object({ action: z.literal("STOP_ROUND"), roundId: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("TOGGLE_INVALID"),
      roundId: z.string().uuid(),
      answerId: z.string().uuid(),
    })
    .strict(),
]);

export const finishBellHopRunSchema = z
  .object({
    bellsHit: z.number().int().min(0).max(5_000),
    maxHeight: z.number().int().min(0).max(1_000_000),
    durationMs: z.number().int().min(0).max(14_400_000),
  })
  .strict();

export const finishTowerStackRunSchema = z
  .object({
    blocksPlaced: z.number().int().min(0).max(1_000),
    livesRemaining: z.literal(0),
    durationMs: z.number().int().min(0).max(14_400_000),
  })
  .strict();

export const gameCommunityParamsSchema = z.object({ communityId: z.string().uuid() }).strict();

export const gameRoomParamsSchema = gameCommunityParamsSchema
  .extend({ roomId: z.string().uuid() })
  .strict();

export const bellHopRunParamsSchema = gameCommunityParamsSchema
  .extend({ runId: z.string().uuid() })
  .strict();

export const towerStackRunParamsSchema = gameCommunityParamsSchema
  .extend({ runId: z.string().uuid() })
  .strict();

export type TicTacToeRules = z.infer<typeof ticTacToeRulesSchema>;
export type HangmanRules = z.infer<typeof hangmanRulesSchema>;
export type StopRules = z.infer<typeof stopRulesSchema>;
export type CreateGameRoomInput = z.infer<typeof createGameRoomSchema>;
export type GameRoomAction = z.infer<typeof gameRoomActionSchema>;
export type TicTacToeMoveInput = z.infer<typeof ticTacToeMoveSchema>;
export type HangmanSecretInput = z.infer<typeof hangmanSecretSchema>;
export type HangmanGuessInput = z.infer<typeof hangmanGuessSchema>;
export type StopGameAction = z.infer<typeof stopGameActionSchema>;
export type FinishBellHopRunInput = z.infer<typeof finishBellHopRunSchema>;
export type FinishTowerStackRunInput = z.infer<typeof finishTowerStackRunSchema>;
