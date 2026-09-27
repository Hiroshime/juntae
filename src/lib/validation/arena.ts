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
  ARENA_SKIN_TONES,
  isValidStartingArenaAttributes,
} from "@/lib/games/arena";
import { ARENA_BATTLE_ACTIONS } from "@/lib/games/arena-battle";
import { ARENA_CATALOG_KEYS } from "@/lib/games/arena-economy";
import { ARENA_OCCUPATION_TASK_KEYS } from "@/lib/games/arena-occupations";
import { ARENA_SHELTER_ITEM_KEYS } from "@/lib/games/arena-shelter";

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
  origin: z.enum(ids(ARENA_ORIGINS)),
  entryLine: z.string().trim().max(120).optional().default(""),
  victoryLine: z.string().trim().max(120).optional().default(""),
  appearance: arenaAppearanceSchema,
};

export const createArenaGladiatorSchema = z
  .object({ ...identityShape, attributes: arenaAttributesSchema })
  .strict();

export const updateArenaGladiatorSchema = z.object(identityShape).strict();

export const startArenaBattleSchema = z
  .object({
    opponentKey: z
      .string()
      .trim()
      .min(1)
      .max(48)
      .regex(
        /^(?:CAIO_DO_PATIO|NARA_VENTO_DE_COBRE|BORIN_MURALHA|AURELIA_CAMPEA_SOLAR|CHALLENGER_C\d+_S[0-3])$/,
        "Adversário inválido.",
      ),
  })
  .strict();

export const arenaBattleActionSchema = z
  .object({ action: z.enum(ARENA_BATTLE_ACTIONS), round: z.number().int().positive() })
  .strict();

export const arenaBattleParamsSchema = z
  .object({ communityId: z.string().uuid(), battleId: z.string().uuid() })
  .strict();

export const purchaseArenaItemSchema = z
  .object({ catalogItemKey: z.enum(ARENA_CATALOG_KEYS) })
  .strict();

export const equipArenaItemSchema = z.object({ equipped: z.boolean() }).strict();

export const arenaInventoryItemParamsSchema = z
  .object({ communityId: z.string().uuid(), itemId: z.string().uuid() })
  .strict();

export const spendArenaSkillPointSchema = z
  .object({ attribute: z.enum(ARENA_ATTRIBUTE_KEYS) })
  .strict();

export const resetArenaGladiatorSchema = z
  .object({
    confirmation: z.string().trim().min(2).max(40),
  })
  .strict();

export const upgradeArenaShelterSchema = z.object({}).strict();

export const purchaseArenaShelterItemSchema = z
  .object({ catalogItemKey: z.enum(ARENA_SHELTER_ITEM_KEYS) })
  .strict();

export const startArenaOccupationSchema = z
  .object({ taskKey: z.enum(ARENA_OCCUPATION_TASK_KEYS) })
  .strict();

export const startArenaPvpRaidSchema = z.object({ defenderId: z.string().uuid() }).strict();

export type CreateArenaGladiatorInput = z.infer<typeof createArenaGladiatorSchema>;
export type UpdateArenaGladiatorInput = z.infer<typeof updateArenaGladiatorSchema>;
export type StartArenaBattleInput = z.infer<typeof startArenaBattleSchema>;
export type ArenaBattleActionInput = z.infer<typeof arenaBattleActionSchema>;
export type PurchaseArenaItemInput = z.infer<typeof purchaseArenaItemSchema>;
export type EquipArenaItemInput = z.infer<typeof equipArenaItemSchema>;
export type SpendArenaSkillPointInput = z.infer<typeof spendArenaSkillPointSchema>;
export type ResetArenaGladiatorInput = z.infer<typeof resetArenaGladiatorSchema>;
export type UpgradeArenaShelterInput = z.infer<typeof upgradeArenaShelterSchema>;
export type PurchaseArenaShelterItemInput = z.infer<typeof purchaseArenaShelterItemSchema>;
export type StartArenaOccupationInput = z.infer<typeof startArenaOccupationSchema>;
export type StartArenaPvpRaidInput = z.infer<typeof startArenaPvpRaidSchema>;
