import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  changeCommunityFundEntry,
  createCommunityFundUsage,
  getCommunityFund,
  getCommunityFundQrCode,
  saveCommunityFundQrCode,
  submitCommunityFundDeposit,
  updateCommunityFundSettings,
} from "@/server/services/community-fund-service";

describe("serviço do Fundão", () => {
  const suffix = randomUUID();
  const userIds: string[] = [];
  let communityId = "";
  let ownerId = "";
  let memberId = "";
  let secondMemberId = "";
  let outsiderId = "";

  beforeAll(async () => {
    const users = await Promise.all(
      ["owner", "member", "second", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `fund-${name}-${suffix}@test.local`,
            passwordHash: "not-used",
          },
        }),
      ),
    );
    [ownerId, memberId, secondMemberId, outsiderId] = users.map((user) => user.id);
    userIds.push(...users.map((user) => user.id));
    const community = await prisma.community.create({
      data: {
        name: "Fund Test",
        slug: `fund-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: memberId, role: "MEMBER", displayName: "Membro" },
            { userId: secondMemberId, role: "MEMBER", displayName: "Segunda" },
          ],
        },
      },
    });
    communityId = community.id;
  });

  afterAll(async () => {
    if (communityId) await prisma.community.delete({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("mantém depósitos pendentes fora do saldo e protege a revisão", async () => {
    const deposit = await submitCommunityFundDeposit(memberId, communityId, {
      amountCents: 5_000,
      referenceMonth: "2026-10",
      effectiveDate: "2026-10-13",
      note: "PIX enviado",
    });
    expect(await getCommunityFund(memberId, communityId)).toMatchObject({
      totalCents: 0,
      myBalanceCents: 0,
      myPendingCents: 5_000,
    });
    await expect(
      changeCommunityFundEntry(memberId, communityId, deposit.id, { action: "APPROVE" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(getCommunityFund(outsiderId, communityId)).rejects.toMatchObject({
      message: "Você não participa desta comunidade.",
    });

    await changeCommunityFundEntry(ownerId, communityId, deposit.id, { action: "APPROVE" });
    expect(await getCommunityFund(memberId, communityId)).toMatchObject({
      totalCents: 5_000,
      myBalanceCents: 5_000,
      myPendingCents: 0,
    });
  });

  it("usa saldo sem permitir gasto duplo e preserva anulações", async () => {
    const usage = await createCommunityFundUsage(ownerId, communityId, {
      userId: memberId,
      eventId: null,
      amountCents: 2_000,
      effectiveDate: "2026-10-14",
      note: "Reserva da chácara",
    });
    expect((await getCommunityFund(memberId, communityId)).myBalanceCents).toBe(3_000);
    await expect(
      createCommunityFundUsage(ownerId, communityId, {
        userId: memberId,
        eventId: null,
        amountCents: 3_001,
        effectiveDate: "2026-10-14",
        note: "Valor acima do saldo",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUND_BALANCE" });

    const approvedDeposit = await prisma.communityFundEntry.findFirstOrThrow({
      where: { communityId, userId: memberId, type: "DEPOSIT", status: "APPROVED" },
    });
    await expect(
      changeCommunityFundEntry(ownerId, communityId, approvedDeposit.id, {
        action: "VOID",
        note: "Tentativa inválida",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUND_BALANCE" });
    await changeCommunityFundEntry(ownerId, communityId, usage.id, {
      action: "VOID",
      note: "Atividade cancelada",
    });
    expect((await getCommunityFund(memberId, communityId)).myBalanceCents).toBe(5_000);
  });

  it("permite cancelar e rejeitar sem gerar crédito e mantém privacidade do histórico", async () => {
    const own = await submitCommunityFundDeposit(secondMemberId, communityId, {
      amountCents: 1_500,
      referenceMonth: "2026-10",
      effectiveDate: "2026-10-13",
      note: "Cancelar",
    });
    await changeCommunityFundEntry(secondMemberId, communityId, own.id, { action: "CANCEL" });
    const rejected = await submitCommunityFundDeposit(secondMemberId, communityId, {
      amountCents: 2_000,
      referenceMonth: "2026-10",
      effectiveDate: "2026-10-13",
      note: "Comprovante incorreto",
    });
    await changeCommunityFundEntry(ownerId, communityId, rejected.id, {
      action: "REJECT",
      note: "Pagamento não localizado",
    });

    const memberView = await getCommunityFund(memberId, communityId);
    const secondView = await getCommunityFund(secondMemberId, communityId);
    const adminView = await getCommunityFund(ownerId, communityId);
    expect(memberView.entries.every((entry) => entry.userId === memberId)).toBe(true);
    expect(secondView.entries.every((entry) => entry.userId === secondMemberId)).toBe(true);
    expect(adminView.entries.some((entry) => entry.userId === memberId)).toBe(true);
    expect(adminView.entries.some((entry) => entry.userId === secondMemberId)).toBe(true);
  });

  it("restringe configurações e QR Code aos administradores, mas permite a leitura por membros", async () => {
    await expect(
      updateCommunityFundSettings(memberId, communityId, {
        monthlyContributionCents: 5_000,
        pixKey: "pix@test.local",
        pixRecipientName: "Grupo",
        pixCopyPaste: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await updateCommunityFundSettings(ownerId, communityId, {
      monthlyContributionCents: 5_000,
      pixKey: "pix@test.local",
      pixRecipientName: "Grupo",
      pixCopyPaste: "000201010212",
    });
    await saveCommunityFundQrCode(ownerId, communityId, {
      data: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
    });
    const view = await getCommunityFund(memberId, communityId);
    expect(view.settings).toMatchObject({
      monthlyContributionCents: 5_000,
      pixKey: "pix@test.local",
      hasQrCode: true,
    });
    expect((await getCommunityFundQrCode(memberId, communityId)).qrCodeData).toBeTruthy();
    await expect(getCommunityFundQrCode(outsiderId, communityId)).rejects.toBeTruthy();
  });
});
