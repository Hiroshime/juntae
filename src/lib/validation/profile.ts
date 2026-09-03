import { z } from "zod";

function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const optionalUrl = z
  .union([z.string().trim().url("Informe uma URL válida.").max(2_000), z.literal("")])
  .transform((value) => value || null);

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "O nome é muito longo."),
  avatarUrl: optionalUrl,
  timezone: z
    .string()
    .trim()
    .min(1, "Informe o timezone.")
    .max(64)
    .refine(isIanaTimezone, "Informe um timezone IANA válido."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8, "Informe sua senha atual."),
    newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "A nova senha deve ser diferente da senha atual.",
    path: ["newPassword"],
  });

export const communityDisplayNameSchema = z.object({
  displayName: z
    .union([z.string().trim().min(2).max(80), z.literal("")])
    .transform((value) => value || null),
});
