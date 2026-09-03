import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/auth";
import { isBootstrapRegistrationAuthorized } from "@/server/services/auth-service";

const account = {
  email: "pessoa@example.com",
  name: "Pessoa Convidada",
  password: "senha-segura-123",
};

describe("validação de cadastro privado", () => {
  it("exige exatamente um convite ou código inicial", () => {
    expect(registerSchema.safeParse(account).success).toBe(false);
    expect(
      registerSchema.safeParse({
        ...account,
        inviteToken: "i".repeat(43),
        bootstrapToken: "b".repeat(64),
      }).success,
    ).toBe(false);
  });

  it("aceita convite sem vínculo com o e-mail", () => {
    expect(registerSchema.safeParse({ ...account, inviteToken: "i".repeat(43) }).success).toBe(
      true,
    );
  });

  it("aceita o código inicial para o bootstrap", () => {
    expect(registerSchema.safeParse({ ...account, bootstrapToken: "b".repeat(64) }).success).toBe(
      true,
    );
  });

  it("aceita o bootstrap correto apenas enquanto não existe usuário", () => {
    const configuredToken = "segredo-inicial-com-pelo-menos-32-caracteres";
    expect(isBootstrapRegistrationAuthorized(0, configuredToken, configuredToken)).toBe(true);
    expect(isBootstrapRegistrationAuthorized(1, configuredToken, configuredToken)).toBe(false);
    expect(
      isBootstrapRegistrationAuthorized(
        0,
        "segredo-incorreto-com-pelo-menos-32-caracteres",
        configuredToken,
      ),
    ).toBe(false);
  });
});
