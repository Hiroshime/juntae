import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export class AuthorizationError extends Error {
  constructor(
    message = "Você não tem permissão para realizar esta ação.",
    public readonly status = 403,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requireAuthenticatedUser() {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("É necessário estar autenticado.", 401);
  return user;
}

export async function requireCommunityMember(communityId: string) {
  const user = await requireAuthenticatedUser();
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId: user.id } },
  });
  if (!membership) throw new AuthorizationError("Você não participa desta comunidade.");
  return { user, membership };
}

export async function requireCommunityAdmin(communityId: string) {
  const result = await requireCommunityMember(communityId);
  if (result.membership.role !== "OWNER" && result.membership.role !== "ADMIN")
    throw new AuthorizationError();
  return result;
}

export async function requireCommunityOwner(communityId: string) {
  const result = await requireCommunityMember(communityId);
  if (result.membership.role !== "OWNER") throw new AuthorizationError();
  return result;
}
