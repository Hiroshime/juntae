import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export const forgotPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(32, "Link de recuperação inválido.")
      .max(256, "Link de recuperação inválido."),
    password: z
      .string()
      .min(8, "A nova senha deve ter pelo menos 8 caracteres.")
      .max(128, "A nova senha deve ter no máximo 128 caracteres."),
    confirmPassword: z.string().min(8, "Confirme a nova senha.").max(128),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export const registerSchema = credentialsSchema
  .extend({
    name: z.string().trim().min(2, "Informe seu nome.").max(80, "O nome é muito longo."),
    confirmPassword: z.string().min(8, "Confirme sua senha."),
    inviteToken: z.string().trim().min(32).max(256).optional(),
    bootstrapToken: z.string().trim().min(32).max(256).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  })
  .refine((data) => Boolean(data.inviteToken) !== Boolean(data.bootstrapToken), {
    message: "É necessário um convite válido para criar a conta.",
    path: ["inviteToken"],
  });
