import { z } from "zod";

export const randomizerPresetSchema = z.enum([
  "TEAMS",
  "GROUPS",
  "CARS",
  "ASSIGN_ITEMS",
  "PICK_PEOPLE",
  "PICK_ITEM",
  "RANDOM_ORDER",
  "PAIRS",
]);

export const randomizerEntrySchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const driverSchema = randomizerEntrySchema.extend({
  capacity: z.number().int().min(0).max(100),
});

const constraintsSchema = z
  .object({
    together: z
      .array(z.array(z.string().min(1)).min(2).max(20))
      .max(30)
      .optional(),
    separate: z
      .array(z.tuple([z.string().min(1), z.string().min(1)]))
      .max(100)
      .optional(),
    fixedGroups: z
      .array(
        z.object({
          participantId: z.string().min(1),
          groupIndex: z.number().int().min(0).max(49),
        }),
      )
      .max(100)
      .optional(),
    captainIds: z.array(z.string().min(1)).max(50).optional(),
    excludedAssignments: z
      .array(z.object({ participantId: z.string().min(1), itemId: z.string().min(1) }))
      .max(500)
      .optional(),
  })
  .default({});

const configurationSchema = z.object({
  groupCount: z.number().int().min(1).max(50).optional(),
  maxGroupSize: z.number().int().min(1).max(100).optional(),
  groupNames: z.array(z.string().trim().max(80)).max(50).optional(),
  drivers: z.array(driverSchema).max(50).optional(),
  items: z.array(randomizerEntrySchema).max(200).optional(),
  count: z.number().int().min(1).max(200).optional(),
  allowRepeatedItems: z.boolean().optional(),
  oddMode: z.enum(["TRIO", "UNPAIRED"]).optional(),
});

export const randomizerRequestSchema = z.object({
  presetType: randomizerPresetSchema,
  participants: z.array(randomizerEntrySchema).max(200),
  configuration: configurationSchema,
  constraints: constraintsSchema,
});

const resultGroupSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  members: z.array(randomizerEntrySchema).max(200),
  captainId: z.string().min(1).optional(),
});

export const randomizerResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("GROUPS"),
    groups: z.array(resultGroupSchema).max(50),
    unassigned: z.array(randomizerEntrySchema).max(200).optional(),
  }),
  z.object({
    kind: z.literal("ASSIGNMENTS"),
    assignments: z
      .array(z.object({ participant: randomizerEntrySchema, item: randomizerEntrySchema }))
      .min(1)
      .max(200),
  }),
  z.object({
    kind: z.literal("SELECTION"),
    selected: z.array(randomizerEntrySchema).min(1).max(200),
  }),
  z.object({
    kind: z.literal("ORDER"),
    ordered: z.array(randomizerEntrySchema).min(1).max(200),
  }),
]);

export const saveRandomizerRunSchema = z.object({
  title: z.string().trim().max(160).nullable().default(null),
  request: randomizerRequestSchema,
  result: randomizerResultSchema,
});

export const randomizerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  take: z.coerce.number().int().min(1).max(50).default(20),
});

export type RandomizerRequestInput = z.infer<typeof randomizerRequestSchema>;
export type SaveRandomizerRunInput = z.infer<typeof saveRandomizerRunSchema>;
