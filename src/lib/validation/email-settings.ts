import { z } from "zod";

const noControlCharacters = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);

const optionalEmail = z
  .union([z.string().trim().email("Informe um e-mail válido.").max(320), z.literal(""), z.null()])
  .transform((value) => value || null);

const hostname = z
  .string()
  .trim()
  .min(1, "Informe o servidor SMTP.")
  .max(255)
  .regex(
    /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/,
    "Informe um hostname SMTP público, sem protocolo ou porta.",
  );

export const communityEmailSettingsSchema = z
  .object({
    provider: z.enum(["GMAIL", "CUSTOM_SMTP"]),
    host: z.string().trim().max(255).default("smtp.gmail.com"),
    port: z.union([z.literal(465), z.literal(587)]),
    secure: z.boolean(),
    username: z
      .string()
      .trim()
      .min(1, "Informe o usuário SMTP.")
      .max(320)
      .refine(noControlCharacters, "O usuário SMTP contém caracteres inválidos."),
    password: z
      .string()
      .min(8, "A senha deve ter pelo menos 8 caracteres.")
      .max(512)
      .refine(noControlCharacters, "A senha contém caracteres inválidos.")
      .optional(),
    fromName: z
      .string()
      .trim()
      .min(2, "Informe o nome do remetente.")
      .max(120)
      .refine(noControlCharacters, "O nome do remetente contém caracteres inválidos."),
    fromEmail: z.string().trim().email("Informe um e-mail de remetente válido.").max(320),
    replyTo: optionalEmail,
    enabled: z.boolean(),
    inviteEmailsEnabled: z.boolean().default(true),
    announcementEmailsEnabled: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.port === 465 && !value.secure)
      context.addIssue({
        code: "custom",
        path: ["secure"],
        message: "A porta 465 exige TLS direto.",
      });
    if (value.port === 587 && value.secure)
      context.addIssue({ code: "custom", path: ["secure"], message: "A porta 587 usa STARTTLS." });
    if (value.provider === "CUSTOM_SMTP") {
      const result = hostname.safeParse(value.host);
      if (!result.success)
        context.addIssue({
          code: "custom",
          path: ["host"],
          message: result.error.issues[0].message,
        });
    }
  })
  .transform((value) => ({
    ...value,
    host: value.provider === "GMAIL" ? "smtp.gmail.com" : value.host.toLowerCase(),
    username: value.provider === "GMAIL" ? value.username.replace(/\s/g, "") : value.username,
    password:
      value.provider === "GMAIL" && value.password
        ? value.password.replace(/\s/g, "")
        : value.password,
  }));

export const emailSettingsCommunityIdSchema = z.object({ communityId: z.string().uuid() }).strict();

export type CommunityEmailSettingsInput = z.infer<typeof communityEmailSettingsSchema>;
