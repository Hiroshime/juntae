import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  acceptInvite,
  createCommunity,
  createInvite,
  getInvitePreview,
  listCommunityMembers,
  removeMember,
  revokeInvite,
  updateCommunity,
  updateMemberRole,
  updateOwnCommunityProfile,
} from "@/server/services/community-service";
import { changePassword, getProfile, updateProfile } from "@/server/services/profile-service";
import { recordSuccessfulLogin, registerUser } from "@/server/services/auth-service";

describe.sequential("phase one services", () => {
  const suffix = randomUUID();
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-atual-123", 4);
    const [owner, member, outsider] = await Promise.all([
      prisma.user.create({
        data: {
          email: `owner-${suffix}@test.local`,
          name: "Owner Teste",
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `member-${suffix}@test.local`,
          name: "Membro Teste",
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `outsider-${suffix}@test.local`,
          name: "Terceiro Teste",
          passwordHash,
        },
      }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId, outsiderId].filter(Boolean) } },
    });
  });

  it("cria uma comunidade e atribui o criador como owner", async () => {
    const community = await createCommunity(ownerId, {
      name: `Comunidade ${suffix}`,
      description: "Integração",
      avatarUrl: null,
    });
    communityId = community.id;
    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: ownerId } },
    });
    expect(membership?.role).toBe("OWNER");
  });

  it("aceita convite válido uma única vez e incrementa seu uso", async () => {
    const { token, invite } = await createInvite(ownerId, communityId, {
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 1,
    });
    await acceptInvite(memberId, token);
    await acceptInvite(memberId, token);
    await expect(acceptInvite(outsiderId, token)).rejects.toMatchObject({
      code: "INVITE_EXHAUSTED",
    });

    const stored = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(stored.useCount).toBe(1);
    expect(await listCommunityMembers(ownerId, communityId)).toHaveLength(2);
  });

  it("registra o último login e só o exibe para administradores", async () => {
    const recorded = await recordSuccessfulLogin(ownerId);
    expect(recorded.lastLoginAt).toBeInstanceOf(Date);

    const lastLoginAt = new Date("2030-09-15T12:34:56.000Z");
    await prisma.user.update({ where: { id: ownerId }, data: { lastLoginAt } });

    const adminView = await listCommunityMembers(ownerId, communityId);
    expect(adminView.find((member) => member.userId === ownerId)?.user.lastLoginAt).toEqual(
      lastLoginAt,
    );

    const memberView = await listCommunityMembers(memberId, communityId);
    expect(memberView.every((member) => !("lastLoginAt" in member.user))).toBe(true);
  });

  it("cria conta somente com convite e já adiciona o novo usuário à comunidade", async () => {
    const email = `invited-${suffix}@test.local`;
    const { token, invite } = await createInvite(ownerId, communityId, {
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 1,
    });

    const registration = await registerUser({
      email,
      name: "Convidado Teste",
      passwordHash: await hash("senha-convidado-123", 4),
      inviteToken: token,
    });

    expect(registration.community?.id).toBe(communityId);
    await expect(
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId, userId: registration.user.id },
        },
      }),
    ).resolves.toMatchObject({ role: "MEMBER" });
    await expect(prisma.invite.findUnique({ where: { id: invite.id } })).resolves.toMatchObject({
      useCount: 1,
    });

    await expect(
      registerUser({
        email: `without-invite-${suffix}@test.local`,
        name: "Sem Convite",
        passwordHash: "hash-de-teste",
      }),
    ).rejects.toMatchObject({ code: "INVITE_REQUIRED", status: 403 });

    await prisma.user.delete({ where: { id: registration.user.id } });
  });

  it("não permite que cadastros concorrentes excedam o limite do convite", async () => {
    const { token, invite } = await createInvite(ownerId, communityId, {
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: 1,
    });
    const registrations = await Promise.allSettled(
      ["a", "b"].map((prefix) =>
        registerUser({
          email: `concurrent-${prefix}-${suffix}@test.local`,
          name: `Concorrente ${prefix}`,
          passwordHash: "hash-de-teste",
          inviteToken: token,
        }),
      ),
    );

    expect(registrations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(registrations.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.invite.findUnique({ where: { id: invite.id } })).resolves.toMatchObject({
      useCount: 1,
    });
    expect(
      await prisma.user.count({
        where: { email: { startsWith: "concurrent-", endsWith: `-${suffix}@test.local` } },
      }),
    ).toBe(1);
    await prisma.user.deleteMany({
      where: { email: { startsWith: "concurrent-", endsWith: `-${suffix}@test.local` } },
    });
  });

  it("permite que qualquer usuário cadastrado crie outra comunidade", async () => {
    const community = await createCommunity(memberId, {
      name: `Comunidade do membro ${suffix}`,
      description: null,
      avatarUrl: null,
    });
    await expect(
      prisma.communityMember.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: memberId } },
      }),
    ).resolves.toMatchObject({ role: "OWNER" });
    await prisma.community.delete({ where: { id: community.id } });
  });

  it("impede membro comum de editar a comunidade", async () => {
    await expect(
      updateCommunity(memberId, communityId, {
        name: "Não permitido",
        description: null,
        avatarUrl: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createInvite(memberId, communityId, { expiresAt: null, maxUses: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejeita convites expirados e revogados", async () => {
    const expired = await createInvite(ownerId, communityId, {
      expiresAt: new Date(Date.now() - 1_000),
      maxUses: null,
    });
    await expect(getInvitePreview(expired.token, outsiderId)).rejects.toMatchObject({
      code: "INVITE_EXPIRED",
    });

    const revoked = await createInvite(ownerId, communityId, {
      expiresAt: new Date(Date.now() + 60_000),
      maxUses: null,
    });
    await revokeInvite(ownerId, communityId, revoked.invite.id);
    await expect(acceptInvite(outsiderId, revoked.token)).rejects.toMatchObject({
      code: "INVITE_REVOKED",
    });
  });

  it("atualiza papel, nome comunitário e protege auto-remoção", async () => {
    await updateMemberRole(ownerId, communityId, memberId, "ADMIN");
    await updateOwnCommunityProfile(memberId, communityId, "Apelido");
    const membership = await prisma.communityMember.findUniqueOrThrow({
      where: { communityId_userId: { communityId, userId: memberId } },
    });
    expect(membership).toMatchObject({ role: "ADMIN", displayName: "Apelido" });
    await expect(removeMember(ownerId, communityId, ownerId)).rejects.toMatchObject({
      code: "SELF_REMOVAL",
    });
    await expect(updateMemberRole(ownerId, communityId, ownerId, "MEMBER")).rejects.toMatchObject({
      code: "SELF_ROLE_CHANGE",
    });
  });

  it("edita perfil e troca a senha após validar a atual", async () => {
    await updateProfile(memberId, {
      name: "Membro Atualizado",
      avatarUrl: "https://example.com/avatar.png",
      timezone: "America/Sao_Paulo",
    });
    const profile = await getProfile(memberId);
    expect(profile.name).toBe("Membro Atualizado");
    await expect(
      changePassword(memberId, { currentPassword: "senha-errada", newPassword: "senha-nova-123" }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: memberId } });
    const changed = await changePassword(memberId, {
      currentPassword: "senha-atual-123",
      newPassword: "senha-nova-123",
    });
    expect(changed.sessionVersion).toBe(before.sessionVersion + 1);
  });
});
