import { z } from "zod";

const optionalUrl = z
  .union([z.string().trim().url("Informe uma URL válida.").max(2_000), z.literal("")])
  .transform((value) => value || null);

export const createCommunitySchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da comunidade.").max(120),
  description: z
    .union([z.string().trim().max(1_000), z.literal("")])
    .transform((value) => value || null),
  avatarUrl: optionalUrl,
});

export const updateCommunitySchema = createCommunitySchema;

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export const createInviteSchema = z.object({
  expiresAt: z
    .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
    .transform((value) => (value ? new Date(value) : null))
    .refine((value) => !value || value.getTime() > Date.now(), "A expiração deve estar no futuro."),
  maxUses: z.union([z.number().int().min(1).max(100), z.null()]).default(null),
});
