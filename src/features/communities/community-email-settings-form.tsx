"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type EmailSettings = {
  provider: "GMAIL" | "CUSTOM_SMTP";
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  enabled: boolean;
  inviteEmailsEnabled: boolean;
  announcementEmailsEnabled: boolean;
  passwordConfigured: boolean;
  lastTestedAt: Date | string | null;
  lastTestSucceeded: boolean | null;
  lastTestErrorCode: string | null;
  updatedAt: Date | string;
};

type Delivery = {
  id: string;
  kind: string;
  recipientEmail: string;
  subject: string;
  status: "PENDING" | "SENT" | "FAILED";
  attemptCount: number;
  errorCode: string | null;
  createdAt: Date | string;
  sentAt: Date | string | null;
};

type Props = {
  communityId: string;
  encryptionStatus: "READY" | "MISSING" | "INVALID";
  testRecipient: string;
  settings: EmailSettings | null;
  deliveries: Delivery[];
};

const errorLabels: Record<string, string> = {
  SMTP_AUTHENTICATION_FAILED: "Autenticação recusada",
  SMTP_CONNECTION_FAILED: "Falha de conexão",
  SMTP_RECIPIENT_REJECTED: "Destinatário recusado",
  SMTP_MESSAGE_REJECTED: "Mensagem recusada",
  SMTP_SEND_FAILED: "Envio recusado",
  SMTP_DNS_FAILED: "Servidor não encontrado",
  UNSAFE_SMTP_HOST: "Servidor não permitido",
  EMAIL_CREDENTIAL_UNREADABLE: "Credencial não pôde ser descriptografada",
};

async function responseMessage(response: Response, fallback: string) {
  return response
    .json()
    .then((body) => (typeof body?.error === "string" ? body.error : fallback))
    .catch(() => fallback);
}

export function CommunityEmailSettingsForm({
  communityId,
  encryptionStatus,
  testRecipient,
  settings,
  deliveries,
}: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState(settings?.provider ?? "GMAIL");
  const [transport, setTransport] = useState(settings?.port === 465 ? "465-tls" : "587-starttls");
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const endpoint = `/api/communities/${communityId}/email-settings`;
  const encryptionReady = encryptionStatus === "READY";
  const sendingReady = settings?.enabled && settings.lastTestSucceeded === true;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const port = transport.startsWith("465") ? 465 : 587;
    const payload = {
      provider,
      host: provider === "GMAIL" ? "smtp.gmail.com" : String(form.get("host") ?? ""),
      port,
      secure: port === 465,
      username: String(form.get("username") ?? ""),
      ...(password ? { password } : {}),
      fromName: String(form.get("fromName") ?? ""),
      fromEmail: String(form.get("fromEmail") ?? ""),
      replyTo: String(form.get("replyTo") ?? ""),
      enabled: form.get("enabled") === "on",
      inviteEmailsEnabled: form.get("inviteEmailsEnabled") === "on",
      announcementEmailsEnabled: form.get("announcementEmailsEnabled") === "on",
    };
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseMessage(response, "Falha ao salvar."));
      setMessage({
        kind: "success",
        text: "Configuração salva. Alterações no remetente exigem um novo teste.",
      });
      const passwordInput = event.currentTarget.elements.namedItem("password");
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/test`, { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "Falha no teste."));
      setMessage({ kind: "success", text: `E-mail de teste enviado para ${testRecipient}.` });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha no teste.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remover as credenciais de e-mail desta comunidade?")) return;
    setBusy("delete");
    setMessage(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response, "Falha ao remover."));
      setMessage({ kind: "success", text: "Credenciais removidas." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao remover.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card full-span community-email-settings">
      <div className="card-header">
        <div>
          <div className="eyebrow">E-mail da comunidade</div>
          <h2>Remetente e SMTP próprios</h2>
          <p className="muted">
            Esta credencial pertence somente a esta comunidade e nunca é exibida novamente.
          </p>
        </div>
        {settings && (
          <span className={`status-dot ${sendingReady ? "active" : "inactive"}`}>
            {sendingReady
              ? "Pronto para enviar"
              : settings.enabled
                ? "Aguardando teste"
                : "Desativado"}
          </span>
        )}
      </div>

      {encryptionStatus !== "READY" && (
        <div className="error" role="alert">
          {encryptionStatus === "MISSING"
            ? "Defina EMAIL_CREDENTIALS_ENCRYPTION_KEY no ZimaOS antes de salvar credenciais."
            : "A EMAIL_CREDENTIALS_ENCRYPTION_KEY do servidor é inválida; use uma chave Base64 de 32 bytes."}
        </div>
      )}
      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}

      <form className="form email-settings-form" onSubmit={save}>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="email-provider">Provedor</label>
            <select
              id="email-provider"
              name="provider"
              onChange={(event) => setProvider(event.target.value as typeof provider)}
              value={provider}
            >
              <option value="GMAIL">Gmail / Google Workspace</option>
              <option value="CUSTOM_SMTP">Outro SMTP</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="email-transport">Conexão segura</label>
            <select
              id="email-transport"
              onChange={(event) => setTransport(event.target.value)}
              value={transport}
            >
              <option value="587-starttls">Porta 587 · STARTTLS</option>
              <option value="465-tls">Porta 465 · TLS direto</option>
            </select>
          </div>
        </div>

        {provider === "CUSTOM_SMTP" && (
          <div className="field">
            <label htmlFor="email-host">Servidor SMTP público</label>
            <input
              defaultValue={settings?.provider === "CUSTOM_SMTP" ? settings.host : ""}
              id="email-host"
              name="host"
              placeholder="smtp.exemplo.com"
              required
            />
            <span className="field-help">Não informe protocolo, porta ou endereço IP.</span>
          </div>
        )}

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="email-username">Usuário SMTP</label>
            <input
              autoComplete="username"
              defaultValue={settings?.username ?? ""}
              id="email-username"
              name="username"
              placeholder="grupo@gmail.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email-password">
              {settings?.passwordConfigured ? "Nova senha (opcional)" : "Senha de aplicativo"}
            </label>
            <input
              autoComplete="new-password"
              id="email-password"
              minLength={8}
              name="password"
              placeholder={
                settings?.passwordConfigured ? "Manter a senha atual" : "Senha de aplicativo"
              }
              required={!settings?.passwordConfigured}
              type="password"
            />
          </div>
        </div>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="email-from-name">Nome do remetente</label>
            <input
              defaultValue={settings?.fromName ?? "Juntaê"}
              id="email-from-name"
              maxLength={120}
              name="fromName"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email-from-address">E-mail do remetente</label>
            <input
              defaultValue={settings?.fromEmail ?? ""}
              id="email-from-address"
              maxLength={320}
              name="fromEmail"
              placeholder="grupo@gmail.com"
              required
              type="email"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="email-reply-to">Responder para (opcional)</label>
          <input
            defaultValue={settings?.replyTo ?? ""}
            id="email-reply-to"
            maxLength={320}
            name="replyTo"
            type="email"
          />
        </div>

        <label className="checkbox-row">
          <input defaultChecked={settings?.enabled ?? false} name="enabled" type="checkbox" />
          Ativar o envio de e-mails nesta comunidade
        </label>

        <fieldset className="email-purpose-settings">
          <legend>O que pode ser enviado</legend>
          <label className="checkbox-row">
            <input
              defaultChecked={settings?.inviteEmailsEnabled ?? true}
              name="inviteEmailsEnabled"
              type="checkbox"
            />
            Convites solicitados por owners e administradores
          </label>
          <label className="checkbox-row">
            <input
              defaultChecked={settings?.announcementEmailsEnabled ?? false}
              name="announcementEmailsEnabled"
              type="checkbox"
            />
            Comunicados gerais enviados para todos os membros
          </label>
          <p className="field-help">
            O autor ainda escolhe individualmente se cada comunicado também deve ser enviado por
            e-mail.
          </p>
        </fieldset>

        <div className="actions compact-actions email-settings-actions">
          <button className="button" disabled={!encryptionReady || busy !== null} type="submit">
            {busy === "save" ? "Salvando…" : "Salvar configuração"}
          </button>
          <button
            className="button secondary"
            disabled={!settings || !encryptionReady || busy !== null}
            onClick={() => void testConnection()}
            type="button"
          >
            {busy === "test" ? "Enviando…" : `Enviar teste para ${testRecipient}`}
          </button>
          {settings && (
            <button
              className="button danger-outline"
              disabled={busy !== null}
              onClick={() => void remove()}
              type="button"
            >
              {busy === "delete" ? "Removendo…" : "Remover credenciais"}
            </button>
          )}
        </div>
      </form>

      {settings?.lastTestedAt && (
        <p className="email-test-status">
          <strong>Último teste:</strong> {new Date(settings.lastTestedAt).toLocaleString("pt-BR")} ·{" "}
          {settings.lastTestSucceeded
            ? "enviado com sucesso"
            : errorLabels[settings.lastTestErrorCode ?? ""] || "falhou"}
        </p>
      )}

      {deliveries.length > 0 && (
        <details className="email-delivery-history">
          <summary>Últimos envios ({deliveries.length})</summary>
          <div className="member-list">
            {deliveries.map((delivery) => (
              <div className="member-row" key={delivery.id}>
                <div>
                  <strong>{delivery.subject}</strong>
                  <div className="muted small">
                    Para {delivery.recipientEmail} ·{" "}
                    {new Date(delivery.createdAt).toLocaleString("pt-BR")}
                  </div>
                </div>
                <span
                  className={`status-dot ${delivery.status === "SENT" ? "active" : delivery.status === "FAILED" ? "inactive" : ""}`}
                >
                  {delivery.status === "SENT"
                    ? "Enviado"
                    : delivery.status === "FAILED"
                      ? errorLabels[delivery.errorCode ?? ""] || "Falhou"
                      : "Pendente"}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
