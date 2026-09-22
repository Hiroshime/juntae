import { createHash, randomBytes } from "node:crypto";
import { Prisma, type CommunityRole } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type {
  createCommunitySchema,
  createInviteSchema,
  updateCommunitySchema,
} from "@/lib/validation/community";
import { AppError, assertFound } from "@/server/errors";
import { prepareGamesForMemberRemoval } from "@/server/services/game-service";

type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
type CreateInviteInput = z.infer<typeof createInviteSchema>;

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "comunidade"
  );
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  const existing = await prisma.community.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  return existing ? `${base}-${randomBytes(3).toString("hex")}` : base;
}

export async function createCommunity(userId: string, input: CreateCommunityInput) {
  const slug = await uniqueSlug(input.name);
  return prisma.$transaction(async (tx) => {
    const community = await tx.community.create({
      data: { ...input, slug, createdById: userId },
    });
    await tx.communityMember.create({
      data: { communityId: community.id, userId, role: "OWNER" },
    });
    return community;
  });
}

export async function listUserCommunities(userId: string) {
  return prisma.communityMember.findMany({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: {
      role: true,
      displayName: true,
      joinedAt: true,
      community: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarUrl: true,
          _count: { select: { members: true } },
        },
      },
    },
  });
}

export async function getMembershipBySlug(userId: string, slug: string) {
  return prisma.communityMember.findFirst({
    where: { userId, community: { slug } },
    include: { community: true },
  });
}

export async function getCommunity(userId: string, communityId: string) {
  const membership = await requireMembership(userId, communityId);
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
  });
  return { community: assertFound(community, "Comunidade não encontrada."), membership };
}

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    }),
    "Você não participa desta comunidade.",
  );
}

async function requireAdmin(userId: string, communityId: string) {
  const membership = await requireMembership(userId, communityId);
  if (membership.role === "MEMBER") {
    throw new AppError("Apenas administradores podem realizar esta ação.", 403, "FORBIDDEN");
  }
  return membership;
}

export async function updateCommunity(
  actorId: string,
  communityId: string,
  input: UpdateCommunityInput,
) {
  await requireAdmin(actorId, communityId);
  return prisma.community.update({ where: { id: communityId }, data: input });
}

export async function listCommunityMembers(actorId: string, communityId: string) {
  const membership = await requireMembership(actorId, communityId);
  const canViewLastLogin = membership.role !== "MEMBER";
  return prisma.communityMember.findMany({
    where: { communityId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    select: {
      userId: true,
      displayName: true,
      role: true,
      joinedAt: true,
      user: {
        select: {
          name: true,
          avatarUrl: true,
          timezone: true,
          ...(canViewLastLogin ? { lastLoginAt: true } : {}),
        },
      },
    },
  });
}

export async function updateOwnCommunityProfile(
  userId: string,
  communityId: string,
  displayName: string | null,
) {
  await requireMembership(userId, communityId);
  return prisma.communityMember.update({
    where: { communityId_userId: { communityId, userId } },
    data: { displayName },
  });
}

export async function updateMemberRole(
  actorId: string,
  communityId: string,
  targetUserId: string,
  nextRole: CommunityRole,
) {
  return prisma.$transaction(
    async (tx) => {
      const [actor, target] = await Promise.all([
        tx.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: actorId } },
        }),
        tx.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: targetUserId } },
        }),
      ]);
      if (!actor || actor.role === "MEMBER")
        throw new AppError("Apenas administradores podem realizar esta ação.", 403, "FORBIDDEN");
      if (!target) throw new AppError("Membro não encontrado.", 404, "NOT_FOUND");
      if (actorId === targetUserId)
        throw new AppError("Você não pode alterar o próprio papel.", 400, "SELF_ROLE_CHANGE");
      if (actor.role === "ADMIN" && target.role === "OWNER")
        throw new AppError("Administradores não podem alterar owners.", 403, "FORBIDDEN");
      if (actor.role === "ADMIN" && nextRole === "OWNER")
        throw new AppError("Somente owners podem promover outro owner.", 403, "FORBIDDEN");

      if (target.role === "OWNER" && nextRole !== "OWNER") {
        const owners = await tx.communityMember.count({ where: { communityId, role: "OWNER" } });
        if (owners <= 1)
          throw new AppError("A comunidade precisa manter pelo menos um owner.", 409, "LAST_OWNER");
      }

      return tx.communityMember.update({
        where: { communityId_userId: { communityId, userId: targetUserId } },
        data: { role: nextRole },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeMember(actorId: string, communityId: string, targetUserId: string) {
  await prisma.$transaction(
    async (tx) => {
      const [actor, target] = await Promise.all([
        tx.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: actorId } },
        }),
        tx.communityMember.findUnique({
          where: { communityId_userId: { communityId, userId: targetUserId } },
        }),
      ]);
      if (!actor || actor.role === "MEMBER")
        throw new AppError("Apenas administradores podem realizar esta ação.", 403, "FORBIDDEN");
      if (!target) throw new AppError("Membro não encontrado.", 404, "NOT_FOUND");
      if (actorId === targetUserId)
        throw new AppError("Você não pode remover a si próprio.", 400, "SELF_REMOVAL");
      if (actor.role === "ADMIN" && target.role !== "MEMBER")
        throw new AppError("Administradores só podem remover membros.", 403, "FORBIDDEN");
      if (target.role === "OWNER") {
        const owners = await tx.communityMember.count({ where: { communityId, role: "OWNER" } });
        if (owners <= 1)
          throw new AppError("A comunidade precisa manter pelo menos um owner.", 409, "LAST_OWNER");
      }
      await prepareGamesForMemberRemoval(tx, communityId, targetUserId);
      await tx.communityMember.delete({
        where: { communityId_userId: { communityId, userId: targetUserId } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createInvite(actorId: string, communityId: string, input: CreateInviteInput) {
  await requireAdmin(actorId, communityId);
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.invite.create({
    data: {
      communityId,
      createdById: actorId,
      tokenHash: hashInviteToken(token),
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
    },
    select: { id: true, expiresAt: true, maxUses: true, useCount: true, createdAt: true },
  });
  return { token, invite };
}

export async function listInvites(actorId: string, communityId: string) {
  await requireAdmin(actorId, communityId);
  return prisma.invite.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

export function assertInviteUsable(invite: {
  status: "ACTIVE" | "REVOKED";
  revokedAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
}) {
  if (invite.status !== "ACTIVE" || invite.revokedAt) {
    throw new AppError("Este convite foi revogado.", 410, "INVITE_REVOKED");
  }
  if (invite.expiresAt && invite.expiresAt <= new Date()) {
    throw new AppError("Este convite expirou.", 410, "INVITE_EXPIRED");
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    throw new AppError("Este convite atingiu o limite de usos.", 410, "INVITE_EXHAUSTED");
  }
}

export async function getInvitePreview(token: string, userId?: string) {
  const invite = assertFound(
    await prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      include: { community: { select: { id: true, name: true, avatarUrl: true } } },
    }),
    "Convite inválido.",
  );
  if (userId) {
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: invite.communityId, userId } },
    });
    if (membership) return { community: invite.community, expiresAt: invite.expiresAt };
  }
  assertInviteUsable(invite);
  return { community: invite.community, expiresAt: invite.expiresAt };
}

export async function acceptInvite(userId: string, token: string) {
  const hash = hashInviteToken(token);
  return prisma.$transaction(
    async (tx) => {
      const invite = assertFound(
        await tx.invite.findUnique({ where: { tokenHash: hash }, include: { community: true } }),
        "Convite inválido.",
      );
      const membership = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId: invite.communityId, userId } },
      });
      if (membership) return invite.community;

      assertInviteUsable(invite);

      await tx.communityMember.create({ data: { communityId: invite.communityId, userId } });
      await tx.invite.update({ where: { id: invite.id }, data: { useCount: { increment: 1 } } });
      return invite.community;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function revokeInvite(actorId: string, communityId: string, inviteId: string) {
  await requireAdmin(actorId, communityId);
  const invite = await prisma.invite.findFirst({ where: { id: inviteId, communityId } });
  if (!invite) throw new AppError("Convite não encontrado.", 404, "NOT_FOUND");
  return prisma.invite.update({
    where: { id: inviteId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
}
