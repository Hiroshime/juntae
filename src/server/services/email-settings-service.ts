import type { CommunityEmailSettingsInput } from "@/lib/validation/email-settings";
import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { contentToEmailHtml, escapeHtml, richTextToPlainText } from "@/lib/rich-text";
import {
  decodeEmailEncryptionKey,
  decryptEmailCredential,
  emailEncryptionStatus,
  encryptEmailCredential,
} from "@/server/email/credentials";
import { classifyEmailError, sendSmtpMessage, type SmtpMessage } from "@/server/email/smtp-sender";
import { AppError, assertFound } from "@/server/errors";

type EmailSender = (message: SmtpMessage) => Promise<void>;

async function requireEmailSender(userId: string, communityId: string) {
  const membership = assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        role: true,
        user: { select: { name: true } },
        community: { select: { name: true, slug: true } },
      },
    }),
    "Você não participa desta comunidade.",
  );
  if (membership.role === "MEMBER")
    throw new AppError("Apenas administradores podem enviar e-mails.", 403, "FORBIDDEN");
  return membership;
}

async function requireOwner(userId: string, communityId: string) {
  const membership = assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: {
        role: true,
        user: { select: { email: true, name: true } },
        community: { select: { name: true } },
      },
    }),
    "Você não participa desta comunidade.",
  );
  if (membership.role !== "OWNER")
    throw new AppError(
      "Somente owners podem gerenciar as credenciais de e-mail.",
      403,
      "FORBIDDEN",
    );
  return membership;
}

const publicSelection = {
  provider: true,
  host: true,
  port: true,
  secure: true,
  username: true,
  fromName: true,
  fromEmail: true,
  replyTo: true,
  enabled: true,
  inviteEmailsEnabled: true,
  announcementEmailsEnabled: true,
  lastTestedAt: true,
  lastTestSucceeded: true,
  lastTestErrorCode: true,
  updatedAt: true,
} as const;

export async function getCommunityEmailSettings(userId: string, communityId: string) {
  const owner = await requireOwner(userId, communityId);
  const [settings, deliveries] = await Promise.all([
    prisma.communityEmailSettings.findUnique({
      where: { communityId },
      select: publicSelection,
    }),
    prisma.emailDelivery.findMany({
      where: { communityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        kind: true,
        recipientEmail: true,
        subject: true,
        status: true,
        attemptCount: true,
        errorCode: true,
        createdAt: true,
        sentAt: true,
      },
    }),
  ]);
  return {
    encryptionStatus: emailEncryptionStatus(),
    testRecipient: owner.user.email,
    settings: settings ? { ...settings, passwordConfigured: true } : null,
    deliveries,
  };
}

export async function saveCommunityEmailSettings(
  userId: string,
  communityId: string,
  input: CommunityEmailSettingsInput,
) {
  await requireOwner(userId, communityId);
  decodeEmailEncryptionKey();
  const existing = await prisma.communityEmailSettings.findUnique({
    where: { communityId },
    select: {
      encryptedPassword: true,
      provider: true,
      host: true,
      port: true,
      secure: true,
      username: true,
      fromName: true,
      fromEmail: true,
      replyTo: true,
    },
  });
  if (!existing && !input.password)
    throw new AppError("Informe a senha de aplicativo ou senha SMTP.");
  const encryptedPassword = input.password
    ? encryptEmailCredential(communityId, input.password)
    : existing!.encryptedPassword;
  const settings = {
    provider: input.provider,
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo,
    enabled: input.enabled,
    inviteEmailsEnabled: input.inviteEmailsEnabled,
    announcementEmailsEnabled: input.announcementEmailsEnabled,
  };
  const transportChanged =
    !existing ||
    Boolean(input.password) ||
    existing.provider !== input.provider ||
    existing.host !== input.host ||
    existing.port !== input.port ||
    existing.secure !== input.secure ||
    existing.username !== input.username ||
    existing.fromName !== input.fromName ||
    existing.fromEmail !== input.fromEmail ||
    existing.replyTo !== input.replyTo;
  const saved = await prisma.communityEmailSettings.upsert({
    where: { communityId },
    create: { ...settings, communityId, encryptedPassword, updatedById: userId },
    update: {
      ...settings,
      encryptedPassword,
      updatedById: userId,
      ...(transportChanged
        ? { lastTestedAt: null, lastTestSucceeded: null, lastTestErrorCode: null }
        : {}),
    },
    select: publicSelection,
  });
  return { ...saved, passwordConfigured: true };
}

export async function deleteCommunityEmailSettings(userId: string, communityId: string) {
  await requireOwner(userId, communityId);
  await prisma.communityEmailSettings.deleteMany({ where: { communityId } });
}

export async function testCommunityEmailSettings(
  userId: string,
  communityId: string,
  sender: EmailSender = sendSmtpMessage,
) {
  const owner = await requireOwner(userId, communityId);
  const settings = assertFound(
    await prisma.communityEmailSettings.findUnique({ where: { communityId } }),
    "Configure o e-mail da comunidade antes de testar.",
  );
  const safeCommunityName = owner.community.name.replace(/[\u0000-\u001f\u007f]/g, " ");
  const subject = `Teste de e-mail — ${safeCommunityName}`;
  const delivery = await prisma.emailDelivery.create({
    data: {
      communityId,
      requestedById: userId,
      kind: "SETTINGS_TEST",
      recipientEmail: owner.user.email,
      subject,
    },
    select: { id: true },
  });
  const now = new Date();
  try {
    await sender({
      host: settings.host,
      port: settings.port as 465 | 587,
      secure: settings.secure,
      username: settings.username,
      password: decryptEmailCredential(communityId, settings.encryptedPassword),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo,
      to: owner.user.email,
      subject,
      text: `O envio de e-mail da comunidade ${owner.community.name} está funcionando.`,
      html: `<p>O envio de e-mail da comunidade <strong>${escapeHtml(owner.community.name)}</strong> está funcionando.</p><p>Este foi um teste solicitado por ${escapeHtml(owner.user.name)}.</p>`,
    });
    await prisma.$transaction([
      prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", attemptCount: 1, sentAt: now },
      }),
      prisma.communityEmailSettings.update({
        where: { communityId },
        data: { lastTestedAt: now, lastTestSucceeded: true, lastTestErrorCode: null },
      }),
    ]);
    return { recipient: owner.user.email, sentAt: now };
  } catch (error) {
    const errorCode = classifyEmailError(error);
    await prisma.$transaction([
      prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attemptCount: 1, errorCode },
      }),
      prisma.communityEmailSettings.update({
        where: { communityId },
        data: { lastTestedAt: now, lastTestSucceeded: false, lastTestErrorCode: errorCode },
      }),
    ]);
    if (error instanceof AppError) throw error;
    throw new AppError(
      "O servidor SMTP recusou o teste. Confira endereço, porta, usuário e senha de aplicativo.",
      502,
      errorCode,
    );
  }
}

export async function sendCommunityInviteEmail(
  userId: string,
  communityId: string,
  recipientEmail: string,
  inviteUrl: string,
  sender: EmailSender = sendSmtpMessage,
) {
  const actor = await requireEmailSender(userId, communityId);
  const settings = assertFound(
    await prisma.communityEmailSettings.findUnique({ where: { communityId } }),
    "Esta comunidade ainda não configurou o envio de e-mails.",
  );
  if (!settings.enabled || !settings.inviteEmailsEnabled || settings.lastTestSucceeded !== true)
    throw new AppError(
      "Habilite e-mails de convite e conclua um teste antes de enviar.",
      409,
      "EMAIL_SETTINGS_NOT_READY",
    );
  const communityName = actor.community.name.replace(/[\u0000-\u001f\u007f]/g, " ");
  const subject = `Convite para ${communityName}`;
  const delivery = await prisma.emailDelivery.create({
    data: {
      communityId,
      requestedById: userId,
      kind: "COMMUNITY_INVITE",
      recipientEmail,
      subject,
    },
    select: { id: true },
  });
  const now = new Date();
  try {
    await sender({
      host: settings.host,
      port: settings.port as 465 | 587,
      secure: settings.secure,
      username: settings.username,
      password: decryptEmailCredential(communityId, settings.encryptedPassword),
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo,
      to: recipientEmail,
      subject,
      text: `${actor.user.name} convidou você para participar de ${communityName} no Juntaê. Abra o convite: ${inviteUrl}`,
      html: `<p><strong>${escapeHtml(actor.user.name)}</strong> convidou você para participar de <strong>${escapeHtml(communityName)}</strong> no Juntaê.</p><p><a href="${escapeHtml(inviteUrl)}">Abrir convite</a></p><p>Se você não esperava este convite, ignore esta mensagem.</p>`,
    });
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", attemptCount: 1, sentAt: now },
    });
    return { recipient: recipientEmail, sentAt: now };
  } catch (error) {
    const errorCode = classifyEmailError(error);
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", attemptCount: 1, errorCode },
    });
    if (error instanceof AppError) throw error;
    throw new AppError(
      "O convite foi criado, mas o servidor SMTP recusou o e-mail.",
      502,
      errorCode,
    );
  }
}

export type AnnouncementEmailSummary = {
  total: number;
  sent: number;
  failed: number;
};

const MAX_ANNOUNCEMENT_RECIPIENTS = 250;
const ANNOUNCEMENT_SEND_CONCURRENCY = 3;

export async function sendCommunityAnnouncementEmail(
  userId: string,
  communityId: string,
  socialPostId: string,
  subjectInput: string | undefined,
  sender: EmailSender = sendSmtpMessage,
): Promise<AnnouncementEmailSummary> {
  const actor = await requireEmailSender(userId, communityId);
  const [settings, post, memberships] = await Promise.all([
    prisma.communityEmailSettings.findUnique({ where: { communityId } }),
    prisma.socialPost.findFirst({
      where: { id: socialPostId, communityId, kind: "ANNOUNCEMENT" },
      select: { id: true, content: true, contentFormat: true },
    }),
    prisma.communityMember.findMany({
      where: { communityId },
      select: { user: { select: { email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);
  const configured = assertFound(settings, "Esta comunidade ainda não configurou e-mail.");
  const announcement = assertFound(post, "Comunicado não encontrado.");
  if (!announcement.content)
    throw new AppError("O comunicado precisa ter texto para ser enviado por e-mail.");
  if (
    !configured.enabled ||
    !configured.announcementEmailsEnabled ||
    configured.lastTestSucceeded !== true
  )
    throw new AppError(
      "Habilite e-mails de comunicados e conclua um teste antes de enviar.",
      409,
      "EMAIL_SETTINGS_NOT_READY",
    );

  const recipients = [...new Set(memberships.map((item) => item.user.email.toLowerCase()))];
  if (recipients.length > MAX_ANNOUNCEMENT_RECIPIENTS)
    throw new AppError(
      `O envio direto suporta até ${MAX_ANNOUNCEMENT_RECIPIENTS} membros por comunicado.`,
      409,
      "EMAIL_RECIPIENT_LIMIT",
    );

  const communityName = actor.community.name.replace(/[\u0000-\u001f\u007f]/g, " ");
  const fallbackSubject = `Comunicado de ${communityName}`;
  const subject = (subjectInput?.trim() || fallbackSubject)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 180);
  const password = decryptEmailCredential(communityId, configured.encryptedPassword);
  const rich = announcement.contentFormat === "MARKDOWN";
  const postUrl = new URL(
    `/app/${encodeURIComponent(actor.community.slug)}/social#post-${announcement.id}`,
    getEnv().APP_URL,
  ).toString();
  const plainContent = rich ? richTextToPlainText(announcement.content) : announcement.content;
  const htmlContent = contentToEmailHtml(announcement.content, rich);
  let sent = 0;
  let failed = 0;

  const deliver = async (recipientEmail: string) => {
    const delivery = await prisma.emailDelivery.create({
      data: {
        communityId,
        requestedById: userId,
        socialPostId: announcement.id,
        kind: "COMMUNITY_ANNOUNCEMENT",
        recipientEmail,
        subject,
      },
      select: { id: true },
    });
    try {
      await sender({
        host: configured.host,
        port: configured.port as 465 | 587,
        secure: configured.secure,
        username: configured.username,
        password,
        fromName: configured.fromName,
        fromEmail: configured.fromEmail,
        replyTo: configured.replyTo,
        to: recipientEmail,
        subject,
        text: `${plainContent}\n\nAbra o comunicado no Juntaê: ${postUrl}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124"><p style="color:#666">Comunicado de <strong>${escapeHtml(communityName)}</strong></p>${htmlContent}<p><a href="${escapeHtml(postUrl)}">Abrir no Juntaê para ver anexos e comentários</a></p><p style="color:#777;font-size:12px">Enviado por ${escapeHtml(actor.user.name)}.</p></div>`,
      });
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", attemptCount: 1, sentAt: new Date() },
      });
      sent += 1;
    } catch (error) {
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attemptCount: 1, errorCode: classifyEmailError(error) },
      });
      failed += 1;
    }
  };

  for (let index = 0; index < recipients.length; index += ANNOUNCEMENT_SEND_CONCURRENCY) {
    await Promise.all(recipients.slice(index, index + ANNOUNCEMENT_SEND_CONCURRENCY).map(deliver));
  }
  return { total: recipients.length, sent, failed };
}
