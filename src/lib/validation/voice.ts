import { z } from "zod";

export const voiceChannelInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres.")
      .max(60, "O nome pode ter no máximo 60 caracteres."),
    description: z
      .string()
      .trim()
      .max(160, "A descrição pode ter no máximo 160 caracteres.")
      .optional(),
    maxParticipants: z.coerce
      .number()
      .int()
      .min(2, "A sala precisa aceitar pelo menos 2 pessoas.")
      .max(50, "A sala pode aceitar no máximo 50 pessoas."),
  })
  .strict()
  .transform((value) => ({ ...value, description: value.description || null }));

export const voiceCommunityIdsSchema = z.object({ communityId: z.string().uuid() }).strict();
export const voiceChannelIdsSchema = voiceCommunityIdsSchema
  .extend({ channelId: z.string().uuid() })
  .strict();
