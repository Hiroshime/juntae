import { z } from "zod";

export const socialPostSchema = z
  .object({
    kind: z.enum(["POST", "ANNOUNCEMENT"]).default("POST"),
    content: z.string().trim().max(5000, "O texto pode ter no máximo 5.000 caracteres."),
  })
  .strict();

export const socialCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Escreva um comentário.")
      .max(1000, "O comentário pode ter no máximo 1.000 caracteres."),
  })
  .strict();

export const socialReactionSchema = z
  .object({ type: z.enum(["LIKE", "LOVE", "CELEBRATE", "LAUGH", "SUPPORT"]) })
  .strict();

export const socialPageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

export const socialCommunityIdsSchema = z.object({ communityId: z.string().uuid() }).strict();
export const socialPostIdsSchema = socialCommunityIdsSchema
  .extend({ postId: z.string().uuid() })
  .strict();
export const socialCommentIdsSchema = socialPostIdsSchema
  .extend({ commentId: z.string().uuid() })
  .strict();
export const socialMediaIdsSchema = socialPostIdsSchema
  .extend({ mediaId: z.string().uuid() })
  .strict();

export type SocialPostInput = z.infer<typeof socialPostSchema>;
