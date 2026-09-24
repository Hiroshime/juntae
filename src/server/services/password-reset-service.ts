import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { getEnv, getPasswordResetEmailConfig, type PasswordResetEmailConfig } from "@/lib/env";
import { escapeHtml } from "@/lib/rich-text";
import { prisma } from "@/lib/db/prisma";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { classifyEmailError, sendSmtpMessage, type SmtpMessage } from "@/server/email/smtp-sender";
import { AppError } from "@/server/errors";

const RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1_000;
export const PASSWORD_RESET_ACCEPTED_MESSAGE =
  "Se existir uma conta com esse e-mail e o envio estiver configurado, você receberá as instruções em alguns minutos.";

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
type EmailSender = (message: SmtpMessage) => Promise<void>;

type RequestOptions = {
  now?: Date;
  sender?: EmailSender;
  configuration?: PasswordResetEmailConfig | null;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function serializable<T>(operation: (db: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034")
        throw error;
      if (attempt === 2)
        throw new AppError("A operação mudou durante a solicitação. Tente novamente.", 409);
    }
  }
  throw new Error("Unreachable transaction retry");
}

function resetUrl(rawToken: string) {
  const url = new URL("/reset-password", getEnv().APP_URL);
  url.hash = `token=${encodeURIComponent(rawToken)}`;
  return url.toString();
}

function messageFor(
  configuration: PasswordResetEmailConfig,
  recipient: { email: string; name: string },
  url: string,
): SmtpMessage {
  const safeName = escapeHtml(recipient.name);
  const safeUrl = escapeHtml(url);
  return {
    ...configuration,
    replyTo: null,
    to: recipient.email,
    subject: "Redefina sua senha do Juntaê",
    text: [
      `Olá, ${recipient.name}.`,
      "",
      "Recebemos uma solicitação para redefinir sua senha do Juntaê.",
      `Abra este link em até 30 minutos: ${url}`,
      "",
      "Se você não fez esta solicitação, ignore esta mensagem. Sua senha continua a mesma.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#18313a;max-width:620px;margin:auto"><p>Olá, <strong>${safeName}</strong>.</p><h1 style="font-size:24px">Redefina sua senha</h1><p>Recebemos uma solicitação para redefinir sua senha do Juntaê.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0b6663;color:#fff;text-decoration:none;font-weight:700">Criar nova senha</a></p><p>O link é válido por <strong>30 minutos</strong> e pode ser usado uma única vez.</p><p style="color:#66777d">Se você não fez esta solicitação, ignore esta mensagem. Sua senha continua a mesma.</p></div>`,
  };
}

export async function requestPasswordReset(
  rawInput: ForgotPasswordInput,
  options: RequestOptions = {},
) {
  const input = forgotPasswordSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Dados inválidos.");
  const now = options.now ?? new Date();
  const configuration =
    options.configuration === undefined ? getPasswordResetEmailConfig() : options.configuration;
  const rawToken = randomBytes(32).toString("base64url");
  const user = await prisma.user.findUnique({
    where: { email: input.data.email },
    select: { id: true, email: true, name: true },
  });
  if (!user || !configuration) return { message: PASSWORD_RESET_ACCEPTED_MESSAGE };

  const stored = await serializable(async (db) => {
    await db.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    return db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(rawToken),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS),
      },
      select: { id: true },
    });
  });

  try {
    await (options.sender ?? sendSmtpMessage)(messageFor(configuration, user, resetUrl(rawToken)));
  } catch (error) {
    await prisma.passwordResetToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    console.error(
      JSON.stringify({
        level: "error",
        message: "Password reset email failed",
        errorCode: classifyEmailError(error),
      }),
    );
  }
  return { message: PASSWORD_RESET_ACCEPTED_MESSAGE };
}

export async function resetPassword(rawInput: ResetPasswordInput, now = new Date()) {
  const input = resetPasswordSchema.safeParse(rawInput);
  if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Dados inválidos.");
  const passwordHash = await hash(input.data.password, 12);
  const hashedToken = tokenHash(input.data.token);

  await serializable(async (db) => {
    const token = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashedToken },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!token || token.usedAt || token.expiresAt <= now)
      throw new AppError(
        "Este link é inválido, já foi usado ou expirou. Solicite um novo.",
        400,
        "INVALID_RESET_TOKEN",
      );

    const claimed = await db.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1)
      throw new AppError(
        "Este link é inválido, já foi usado ou expirou. Solicite um novo.",
        400,
        "INVALID_RESET_TOKEN",
      );

    await db.user.update({
      where: { id: token.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await db.passwordResetToken.updateMany({
      where: { userId: token.userId, usedAt: null },
      data: { usedAt: now },
    });
  });
}
