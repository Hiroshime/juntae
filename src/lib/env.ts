import { z } from "zod";

const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const passwordResetEmailKeys = [
  "PASSWORD_RESET_SMTP_HOST",
  "PASSWORD_RESET_SMTP_PORT",
  "PASSWORD_RESET_SMTP_USER",
  "PASSWORD_RESET_SMTP_PASSWORD",
  "PASSWORD_RESET_FROM_NAME",
  "PASSWORD_RESET_FROM_EMAIL",
] as const;

const liveKitKeys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    REGISTRATION_BOOTSTRAP_TOKEN: optionalString(z.string().min(32)),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DEFAULT_TIMEZONE: z.string().min(1).default("America/Sao_Paulo"),
    EMAIL_CREDENTIALS_ENCRYPTION_KEY: optionalString(z.string()),
    PASSWORD_RESET_SMTP_HOST: optionalString(z.string().trim().min(1)),
    PASSWORD_RESET_SMTP_PORT: z.preprocess(
      (value) => (value === "" || value == null ? undefined : Number(value)),
      z.union([z.literal(465), z.literal(587)]).optional(),
    ),
    PASSWORD_RESET_SMTP_USER: optionalString(z.string().trim().min(1)),
    PASSWORD_RESET_SMTP_PASSWORD: optionalString(z.string().min(1)),
    PASSWORD_RESET_FROM_NAME: optionalString(z.string().trim().min(1).max(100)),
    PASSWORD_RESET_FROM_EMAIL: optionalString(z.string().trim().toLowerCase().email()),
    LIVEKIT_URL: optionalString(
      z
        .string()
        .url()
        .refine((url) => ["ws:", "wss:"].includes(new URL(url).protocol), {
          message: "LIVEKIT_URL deve usar ws:// ou wss://.",
        }),
    ),
    LIVEKIT_API_KEY: optionalString(z.string().trim().min(1)),
    LIVEKIT_API_SECRET: optionalString(z.string().min(16)),
  })
  .superRefine((value, context) => {
    const configured = passwordResetEmailKeys.filter((key) => value[key] !== undefined);
    if (configured.length > 0 && configured.length < passwordResetEmailKeys.length)
      context.addIssue({
        code: "custom",
        message: "Configure todas as variáveis PASSWORD_RESET_SMTP_* e PASSWORD_RESET_FROM_*.",
        path: [configured.length ? configured[0] : "PASSWORD_RESET_SMTP_HOST"],
      });
    const liveKitConfigured = liveKitKeys.filter((key) => value[key] !== undefined);
    if (liveKitConfigured.length > 0 && liveKitConfigured.length < liveKitKeys.length)
      context.addIssue({
        code: "custom",
        message: "Configure LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET em conjunto.",
        path: [liveKitConfigured.length ? liveKitConfigured[0] : "LIVEKIT_URL"],
      });
  });

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    REGISTRATION_BOOTSTRAP_TOKEN: process.env.REGISTRATION_BOOTSTRAP_TOKEN,
    APP_URL: process.env.APP_URL,
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
    EMAIL_CREDENTIALS_ENCRYPTION_KEY: process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY,
    PASSWORD_RESET_SMTP_HOST: process.env.PASSWORD_RESET_SMTP_HOST,
    PASSWORD_RESET_SMTP_PORT: process.env.PASSWORD_RESET_SMTP_PORT,
    PASSWORD_RESET_SMTP_USER: process.env.PASSWORD_RESET_SMTP_USER,
    PASSWORD_RESET_SMTP_PASSWORD: process.env.PASSWORD_RESET_SMTP_PASSWORD,
    PASSWORD_RESET_FROM_NAME: process.env.PASSWORD_RESET_FROM_NAME,
    PASSWORD_RESET_FROM_EMAIL: process.env.PASSWORD_RESET_FROM_EMAIL,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  });
}

export type PasswordResetEmailConfig = {
  host: string;
  port: 465 | 587;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export function getPasswordResetEmailConfig(): PasswordResetEmailConfig | null {
  const env = getEnv();
  if (!env.PASSWORD_RESET_SMTP_HOST) return null;
  return {
    host: env.PASSWORD_RESET_SMTP_HOST,
    port: env.PASSWORD_RESET_SMTP_PORT!,
    secure: env.PASSWORD_RESET_SMTP_PORT === 465,
    username: env.PASSWORD_RESET_SMTP_USER!,
    password: env.PASSWORD_RESET_SMTP_PASSWORD!,
    fromName: env.PASSWORD_RESET_FROM_NAME!,
    fromEmail: env.PASSWORD_RESET_FROM_EMAIL!,
  };
}

export type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function getLiveKitConfig(): LiveKitConfig | null {
  const env = getEnv();
  if (!env.LIVEKIT_URL) return null;
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY!,
    apiSecret: env.LIVEKIT_API_SECRET!,
  };
}
