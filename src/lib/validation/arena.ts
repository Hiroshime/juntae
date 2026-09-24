import { z } from "zod";
import {
  ARENA_ATTRIBUTE_KEYS,
  ARENA_BEARD_STYLES,
  ARENA_BODY_TYPES,
  ARENA_FACE_MARKS,
  ARENA_HAIR_COLORS,
  ARENA_HAIR_STYLES,
  ARENA_MAX_STARTING_ATTRIBUTE,
  ARENA_ORIGINS,
  ARENA_PRONOUNS,
  ARENA_SKIN_TONES,
  isValidStartingArenaAttributes,
} from "@/lib/games/arena";

const ids = <T extends readonly [{ id: string }, ...Array<{ id: string }>]>(values: T) =>
  values.map((value) => value.id) as [T[number]["id"], ...Array<T[number]["id"]>];

export const arenaAppearanceSchema = z
  .object({
    version: z.literal(1),
    bodyType: z.enum(ids(ARENA_BODY_TYPES)),
    skinTone: z.enum(ids(ARENA_SKIN_TONES)),
    hairStyle: z.enum(ids(ARENA_HAIR_STYLES)),
    hairColor: z.enum(ids(ARENA_HAIR_COLORS)),
    beardStyle: z.enum(ids(ARENA_BEARD_STYLES)),
    faceMark: z.enum(ids(ARENA_FACE_MARKS)),
  })
  .strict();

export const arenaAttributesSchema = z
  .object(
    Object.fromEntries(
      ARENA_ATTRIBUTE_KEYS.map((key) => [
        key,
        z.number().int().min(1).max(ARENA_MAX_STARTING_ATTRIBUTE),
      ]),
    ) as Record<(typeof ARENA_ATTRIBUTE_KEYS)[number], z.ZodNumber>,
  )
  .strict()
  .refine(isValidStartingArenaAttributes, {
    message: "Distribua exatamente os 14 pontos disponíveis entre os sete atributos.",
  });

const identityShape = {
  name: z
    .string()
    .trim()
    .min(2, "O nome precisa ter ao menos dois caracteres.")
    .max(40, "Use um nome com até 40 caracteres."),
  pronouns: z.enum(ids(ARENA_PRONOUNS)),
  origin: z.enum(ids(ARENA_ORIGINS)),
  entryLine: z.string().trim().max(120).optional().default(""),
  victoryLine: z.string().trim().max(120).optional().default(""),
  appearance: arenaAppearanceSchema,
};

export const createArenaGladiatorSchema = z
  .object({ ...identityShape, attributes: arenaAttributesSchema })
  .strict();

export const updateArenaGladiatorSchema = z.object(identityShape).strict();

export type CreateArenaGladiatorInput = z.infer<typeof createArenaGladiatorSchema>;
export type UpdateArenaGladiatorInput = z.infer<typeof updateArenaGladiatorSchema>;
