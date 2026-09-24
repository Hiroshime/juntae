import { afterEach, describe, expect, it, vi } from "vitest";
import { getPasswordResetEmailConfig } from "@/lib/env";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";

const resetEnvKeys = [
  "PASSWORD_RESET_SMTP_HOST",
  "PASSWORD_RESET_SMTP_PORT",
  "PASSWORD_RESET_SMTP_USER",
  "PASSWORD_RESET_SMTP_PASSWORD",
  "PASSWORD_RESET_FROM_NAME",
  "PASSWORD_RESET_FROM_EMAIL",
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("recuperação de senha", () => {
  it("normaliza o e-mail e exige confirmação idêntica", () => {
    expect(forgotPasswordSchema.parse({ email: "  PESSOA@EXAMPLE.COM " }).email).toBe(
      "pessoa@example.com",
    );
    expect(
      resetPasswordSchema.safeParse({
        token: "t".repeat(43),
        password: "nova-senha-segura",
        confirmPassword: "senha-diferente",
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({
        token: "t".repeat(43),
        password: "nova-senha-segura",
        confirmPassword: "nova-senha-segura",
      }).success,
    ).toBe(true);
  });

  it("mantém o SMTP de recuperação opcional, mas exige configuração completa", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-characters");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    for (const key of resetEnvKeys) vi.stubEnv(key, "");
    expect(getPasswordResetEmailConfig()).toBeNull();

    vi.stubEnv("PASSWORD_RESET_SMTP_HOST", "smtp.gmail.com");
    expect(() => getPasswordResetEmailConfig()).toThrow(/Configure todas as variáveis/);

    vi.stubEnv("PASSWORD_RESET_SMTP_PORT", "465");
    vi.stubEnv("PASSWORD_RESET_SMTP_USER", "conta@example.com");
    vi.stubEnv("PASSWORD_RESET_SMTP_PASSWORD", "senha-de-aplicativo");
    vi.stubEnv("PASSWORD_RESET_FROM_NAME", "Juntaê");
    vi.stubEnv("PASSWORD_RESET_FROM_EMAIL", "conta@example.com");
    expect(getPasswordResetEmailConfig()).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      username: "conta@example.com",
      password: "senha-de-aplicativo",
      fromName: "Juntaê",
      fromEmail: "conta@example.com",
    });
  });
});
