import { z } from "zod";

const modelName = z
  .string()
  .trim()
  .min(1, "Informe o modelo do Ollama.")
  .max(120, "O nome do modelo pode ter no máximo 120 caracteres.")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/,
    "Use somente letras, números, ponto, hífen, barra, sublinhado e dois-pontos no modelo.",
  );

export const communityAiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    model: modelName,
    assistantName: z
      .string()
      .trim()
      .min(2, "O nome do assistente precisa ter pelo menos 2 caracteres.")
      .max(60, "O nome do assistente pode ter no máximo 60 caracteres."),
    customInstructions: z
      .union([z.string().trim().max(1000), z.literal(""), z.null()])
      .transform((value) => value || null),
    includeEvents: z.boolean(),
    includeAvailability: z.boolean(),
    includePolls: z.boolean(),
    includeAnnouncements: z.boolean(),
    includeChallenges: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.enabled &&
      !value.includeEvents &&
      !value.includeAvailability &&
      !value.includePolls &&
      !value.includeAnnouncements &&
      !value.includeChallenges
    ) {
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "Habilite ao menos uma fonte de contexto para ativar a IA.",
      });
    }
  });

export const communityAiMessageSchema = z
  .object({
    conversationId: z.string().uuid().nullable().optional(),
    message: z
      .string()
      .trim()
      .min(2, "Escreva uma pergunta com pelo menos 2 caracteres.")
      .max(2000, "A mensagem pode ter no máximo 2.000 caracteres."),
  })
  .strict();

export const communityAiIdsSchema = z.object({ communityId: z.string().uuid() }).strict();
export const communityAiConversationIdsSchema = communityAiIdsSchema
  .extend({ conversationId: z.string().uuid() })
  .strict();

export type CommunityAiSettingsInput = z.infer<typeof communityAiSettingsSchema>;
export type CommunityAiMessageInput = z.infer<typeof communityAiMessageSchema>;
