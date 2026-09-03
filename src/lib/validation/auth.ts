import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome.").max(80, "O nome é muito longo."),
});
