import { createHash, randomBytes, randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PasswordResetEmailConfig } from "@/lib/env";
import { prisma } from "@/lib/db/prisma";
import type { SmtpMessage } from "@/server/email/smtp-sender";
import {
  PASSWORD_RESET_ACCEPTED_MESSAGE,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/password-reset-service";

describe.sequential("serviço de recuperação de senha", () => {
  const suffix = randomUUID();
  const email = `password-reset-${suffix}@test.local`;
  const oldPassword = "senha-antiga-segura";
  let userId: string;
  const configuration: PasswordResetEmailConfig = {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    username: "mailer@example.com",
    password: "app-password",
    fromName: "Juntaê",
    fromEmail: "mailer@example.com",
  };

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: {
          email,
          name: "Pessoa <script>alert(1)</script>",
          passwordHash: await hash(oldPassword, 4),
          sessionVersion: 7,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  function rawTokenFrom(message: SmtpMessage) {
    const match = message.text.match(/#token=([A-Za-z0-9_-]+)/);
    if (!match?.[1]) throw new Error("E-mail não contém token no fragmento seguro.");
    return match[1];
  }

  it("não revela conta inexistente nem cria token sem remetente configurado", async () => {
    const sender = vi.fn(async () => undefined);
    await expect(
      requestPasswordReset({ email: `missing-${suffix}@test.local` }, { configuration, sender }),
    ).resolves.toEqual({ message: PASSWORD_RESET_ACCEPTED_MESSAGE });
    await expect(requestPasswordReset({ email }, { configuration: null, sender })).resolves.toEqual(
      { message: PASSWORD_RESET_ACCEPTED_MESSAGE },
    );
    expect(sender).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId } })).toBe(0);
  });

  it("revoga o link anterior, troca a senha uma vez e invalida sessões", async () => {
    const messages: SmtpMessage[] = [];
    const sender = async (message: SmtpMessage) => {
      messages.push(message);
    };
    await requestPasswordReset({ email }, { configuration, sender });
    await requestPasswordReset({ email }, { configuration, sender });
    const firstToken = rawTokenFrom(messages[0]);
    const currentToken = rawTokenFrom(messages[1]);
    expect(firstToken).not.toBe(currentToken);
    expect(messages[1].html).not.toContain("<script");
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(1);

    await expect(
      resetPassword({
        token: firstToken,
        password: "nova-senha-segura",
        confirmPassword: "nova-senha-segura",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });

    const attempts = await Promise.allSettled([
      resetPassword({
        token: currentToken,
        password: "nova-senha-segura",
        confirmPassword: "nova-senha-segura",
      }),
      resetPassword({
        token: currentToken,
        password: "outra-senha-segura",
        confirmPassword: "outra-senha-segura",
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.sessionVersion).toBe(8);
    expect(await compare(oldPassword, user.passwordHash)).toBe(false);
    expect(
      (await compare("nova-senha-segura", user.passwordHash)) ||
        (await compare("outra-senha-segura", user.passwordHash)),
    ).toBe(true);
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(0);
  });

  it("recusa token expirado e inutiliza token quando o SMTP falha", async () => {
    const expiredRawToken = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(expiredRawToken).digest("hex"),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      resetPassword({
        token: expiredRawToken,
        password: "senha-nao-aplicada",
        confirmPassword: "senha-nao-aplicada",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      requestPasswordReset(
        { email },
        {
          configuration,
          sender: async () => {
            throw Object.assign(new Error("SMTP indisponível"), { code: "ETIMEDOUT" });
          },
        },
      ),
    ).resolves.toEqual({ message: PASSWORD_RESET_ACCEPTED_MESSAGE });
    expect(errorLog).toHaveBeenCalledWith(expect.not.stringContaining(email));
    errorLog.mockRestore();
    expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(0);
  });
});
