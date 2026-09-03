import { compare, hash } from "bcryptjs";
import type { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { changePasswordSchema, profileSchema } from "@/lib/validation/profile";
import { AppError } from "@/server/errors";

type ProfileInput = z.infer<typeof profileSchema>;
type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      timezone: true,
      createdAt: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          communityId: true,
          displayName: true,
          role: true,
          community: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!user) throw new AppError("Usuário não encontrado.", 404, "NOT_FOUND");
  return user;
}

export async function updateProfile(userId: string, input: ProfileInput) {
  return prisma.user.update({
    where: { id: userId },
    data: input,
    select: { id: true, email: true, name: true, avatarUrl: true, timezone: true },
  });
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await compare(input.currentPassword, user.passwordHash))) {
    throw new AppError("A senha atual está incorreta.", 400, "INVALID_PASSWORD");
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hash(input.newPassword, 12),
      sessionVersion: { increment: 1 },
    },
    select: { sessionVersion: true },
  });
}
