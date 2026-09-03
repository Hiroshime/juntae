import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  REGISTRATION_BOOTSTRAP_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DEFAULT_TIMEZONE: z.string().min(1).default("America/Sao_Paulo"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    REGISTRATION_BOOTSTRAP_TOKEN: process.env.REGISTRATION_BOOTSTRAP_TOKEN,
    APP_URL: process.env.APP_URL,
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE,
  });
}
