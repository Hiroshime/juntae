import { createHash, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { AppError, assertFound } from "@/server/errors";
import { assertInviteUsable, hashInviteToken } from "@/server/services/community-service";

type RegisterUserInput = {
  email: string;
  name: string;
  passwordHash: string;
  inviteToken?: string;
  bootstrapToken?: string;
};

function secretsMatch(received: string | undefined, configured: string | undefined) {
  if (!received || !configured) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(receivedHash, configuredHash);
}

export function isBootstrapRegistrationAuthorized(
  userCount: number,
  receivedToken: string | undefined,
  configuredToken: string | undefined,
) {
  return userCount === 0 && secretsMatch(receivedToken, configuredToken);
}

async function serializableRegistration<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt < 3) continue;
        throw new AppError("Não foi possível reservar este convite.", 409, "REGISTRATION_CONFLICT");
      }
      throw error;
    }
  }
  throw new AppError("Não foi possível reservar este convite.", 409, "REGISTRATION_CONFLICT");
}

export async function isInitialRegistrationAvailable() {
  if (!getEnv().REGISTRATION_BOOTSTRAP_TOKEN) return false;
  return (await prisma.user.count()) === 0;
}

export async function registerUser(input: RegisterUserInput) {
  const configuredBootstrapToken = getEnv().REGISTRATION_BOOTSTRAP_TOKEN;

  return serializableRegistration(() =>
    prisma.$transaction(
      async (tx) => {
        const existingUser = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existingUser) {
          throw new AppError("Este e-mail já está cadastrado.", 409, "EMAIL_ALREADY_EXISTS");
        }

        if (input.inviteToken) {
          const invite = assertFound(
            await tx.invite.findUnique({
              where: { tokenHash: hashInviteToken(input.inviteToken) },
              include: { community: { select: { id: true, slug: true } } },
            }),
            "Convite inválido.",
          );
          assertInviteUsable(invite);

          const user = await tx.user.create({
            data: { email: input.email, name: input.name, passwordHash: input.passwordHash },
            select: { id: true, email: true, name: true, sessionVersion: true },
          });
          await tx.communityMember.create({
            data: { communityId: invite.communityId, userId: user.id },
          });
          await tx.invite.update({
            where: { id: invite.id },
            data: { useCount: { increment: 1 } },
          });
          return { user, community: invite.community };
        }

        const userCount = await tx.user.count();
        if (
          !isBootstrapRegistrationAuthorized(
            userCount,
            input.bootstrapToken,
            configuredBootstrapToken,
          )
        ) {
          throw new AppError(
            "O cadastro está disponível somente por convite.",
            403,
            "INVITE_REQUIRED",
          );
        }

        const user = await tx.user.create({
          data: { email: input.email, name: input.name, passwordHash: input.passwordHash },
          select: { id: true, email: true, name: true, sessionVersion: true },
        });
        return { user, community: null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
}
