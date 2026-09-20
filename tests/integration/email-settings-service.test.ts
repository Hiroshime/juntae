import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  deleteCommunityEmailSettings,
  getCommunityEmailSettings,
  saveCommunityEmailSettings,
  sendCommunityAnnouncementEmail,
  sendCommunityInviteEmail,
  testCommunityEmailSettings,
} from "@/server/services/email-settings-service";
import type { SmtpMessage } from "@/server/email/smtp-sender";

describe.sequential("configuração segregada de e-mail", () => {
  const suffix = randomUUID();
  const previousKey = process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY;
  let communityId = "";
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";

  beforeAll(async () => {
    process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const users = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            email: `email-settings-${name}-${suffix}@test.local`,
            name,
            passwordHash: "unused-test-hash",
          },
        }),
      ),
    );
    [ownerId, adminId, memberId, outsiderId] = users.map((user) => user.id);
    communityId = (
      await prisma.community.create({
        data: {
          name: "E-mail da turma",
          slug: `email-settings-${suffix}`,
          createdById: ownerId,
          members: {
            create: [
              { userId: ownerId, role: "OWNER" },
              { userId: adminId, role: "ADMIN" },
              { userId: memberId, role: "MEMBER" },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId].filter(Boolean) } },
    });
    if (previousKey === undefined) delete process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY = previousKey;
  });

  const input = (password?: string) => ({
    provider: "GMAIL" as const,
    host: "smtp.gmail.com",
    port: 587 as const,
    secure: false,
    username: "grupo@gmail.com",
    password,
    fromName: "Turma",
    fromEmail: "grupo@gmail.com",
    replyTo: null,
    enabled: true,
    inviteEmailsEnabled: true,
    announcementEmailsEnabled: true,
  });

  it("restringe leitura e alteração exclusivamente a owners", async () => {
    await expect(getCommunityEmailSettings(adminId, communityId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getCommunityEmailSettings(memberId, communityId)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getCommunityEmailSettings(outsiderId, communityId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("exige senha inicial, criptografa e nunca a devolve", async () => {
    await expect(saveCommunityEmailSettings(ownerId, communityId, input())).rejects.toMatchObject({
      status: 400,
    });
    await saveCommunityEmailSettings(ownerId, communityId, input("senha-app-secreta"));
    const stored = await prisma.communityEmailSettings.findUniqueOrThrow({
      where: { communityId },
    });
    expect(stored.encryptedPassword).not.toContain("senha-app-secreta");
    const response = await getCommunityEmailSettings(ownerId, communityId);
    expect(response.encryptionStatus).toBe("READY");
    expect(response.settings).toMatchObject({
      username: "grupo@gmail.com",
      passwordConfigured: true,
    });
    expect(JSON.stringify(response)).not.toContain("senha-app-secreta");
    expect(JSON.stringify(response)).not.toContain(stored.encryptedPassword);

    await saveCommunityEmailSettings(ownerId, communityId, {
      ...input(),
      fromName: "Turma atualizada",
    });
    expect(
      (await prisma.communityEmailSettings.findUniqueOrThrow({ where: { communityId } }))
        .encryptedPassword,
    ).toBe(stored.encryptedPassword);
  });

  it("envia teste ao owner, registra apenas metadados e atualiza o estado", async () => {
    let sent: SmtpMessage | undefined;
    const result = await testCommunityEmailSettings(ownerId, communityId, async (message) => {
      sent = message;
    });
    expect(result.recipient).toContain("email-settings-owner-");
    expect(sent).toMatchObject({
      password: "senha-app-secreta",
      host: "smtp.gmail.com",
      to: result.recipient,
    });
    const response = await getCommunityEmailSettings(ownerId, communityId);
    expect(response.settings).toMatchObject({ lastTestSucceeded: true, lastTestErrorCode: null });
    expect(response.deliveries[0]).toMatchObject({
      status: "SENT",
      recipientEmail: result.recipient,
      attemptCount: 1,
    });
    expect(JSON.stringify(response.deliveries)).not.toContain("senha-app-secreta");
  });

  it("registra falha sanitizada sem persistir mensagem ou credencial", async () => {
    const smtpError = Object.assign(new Error("detalhe SMTP sensível"), { code: "EAUTH" });
    await expect(
      testCommunityEmailSettings(ownerId, communityId, async () => {
        throw smtpError;
      }),
    ).rejects.toMatchObject({ status: 502, code: "SMTP_AUTHENTICATION_FAILED" });
    const response = await getCommunityEmailSettings(ownerId, communityId);
    expect(response.settings).toMatchObject({
      lastTestSucceeded: false,
      lastTestErrorCode: "SMTP_AUTHENTICATION_FAILED",
    });
    expect(response.deliveries[0]).toMatchObject({
      status: "FAILED",
      errorCode: "SMTP_AUTHENTICATION_FAILED",
    });
    expect(JSON.stringify(response)).not.toContain("detalhe SMTP sensível");
  });

  it("permite que admin envie convite somente após configuração ativa e testada", async () => {
    await expect(
      sendCommunityInviteEmail(
        memberId,
        communityId,
        "convidado@example.com",
        "https://juntae.example/join/token",
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 403 });

    await testCommunityEmailSettings(ownerId, communityId, async () => {});
    let sent: SmtpMessage | undefined;
    await sendCommunityInviteEmail(
      adminId,
      communityId,
      "convidado@example.com",
      "https://juntae.example/join/token",
      async (message) => {
        sent = message;
      },
    );
    expect(sent).toMatchObject({
      to: "convidado@example.com",
      password: "senha-app-secreta",
      subject: "Convite para E-mail da turma",
    });
    const delivery = await prisma.emailDelivery.findFirstOrThrow({
      where: { communityId, kind: "COMMUNITY_INVITE" },
      orderBy: { createdAt: "desc" },
    });
    expect(delivery).toMatchObject({ status: "SENT", requestedById: adminId, attemptCount: 1 });
  });

  it("envia comunicado formatado individualmente a todos os membros", async () => {
    const post = await prisma.socialPost.create({
      data: {
        communityId,
        authorId: adminId,
        kind: "ANNOUNCEMENT",
        contentFormat: "MARKDOWN",
        content: "# Nova função\n\nAgora temos **e-mail**.\n\n<script>não executar</script>",
      },
    });
    const messages: SmtpMessage[] = [];
    const summary = await sendCommunityAnnouncementEmail(
      adminId,
      communityId,
      post.id,
      "Novidade no Juntaê",
      async (message) => {
        messages.push(message);
      },
    );
    expect(summary).toEqual({ total: 3, sent: 3, failed: 0 });
    expect(new Set(messages.map((message) => message.to)).size).toBe(3);
    expect(messages[0]).toMatchObject({ subject: "Novidade no Juntaê" });
    expect(messages[0].html).toContain("<strong>e-mail</strong>");
    expect(messages[0].html).toContain("&lt;script&gt;");
    expect(messages[0].html).not.toContain("<script>");
    expect(
      await prisma.emailDelivery.count({
        where: { communityId, socialPostId: post.id, status: "SENT" },
      }),
    ).toBe(3);

    let attempt = 0;
    const partial = await sendCommunityAnnouncementEmail(
      ownerId,
      communityId,
      post.id,
      undefined,
      async () => {
        attempt += 1;
        if (attempt === 2) throw Object.assign(new Error("recusado"), { code: "EENVELOPE" });
      },
    );
    expect(partial).toEqual({ total: 3, sent: 2, failed: 1 });
    expect(
      await prisma.emailDelivery.count({
        where: {
          communityId,
          socialPostId: post.id,
          status: "FAILED",
          errorCode: "SMTP_RECIPIENT_REJECTED",
        },
      }),
    ).toBe(1);

    await saveCommunityEmailSettings(ownerId, communityId, {
      ...input(),
      fromName: "Turma atualizada",
      announcementEmailsEnabled: false,
    });
    expect(
      (await getCommunityEmailSettings(ownerId, communityId)).settings?.lastTestSucceeded,
    ).toBe(true);
    await expect(
      sendCommunityAnnouncementEmail(adminId, communityId, post.id, undefined, async () => {}),
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_SETTINGS_NOT_READY" });
  });

  it("remove somente as credenciais e preserva o histórico sem segredo", async () => {
    await deleteCommunityEmailSettings(ownerId, communityId);
    expect(await prisma.communityEmailSettings.findUnique({ where: { communityId } })).toBeNull();
    expect(await prisma.emailDelivery.count({ where: { communityId } })).toBe(10);
    await expect(
      testCommunityEmailSettings(ownerId, communityId, async () => {}),
    ).rejects.toMatchObject({ status: 404 });
  });
});
