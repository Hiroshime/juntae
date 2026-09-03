"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Community = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
};

type Invite = {
  id: string;
  status: "ACTIVE" | "REVOKED";
  expiresAt: Date | string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  createdBy: { name: string };
};

export function CommunitySettingsForms({
  community,
  invites,
}: {
  community: Community;
  invites: Invite[];
}) {
  const router = useRouter();
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  async function saveCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsMessage(null);
    const response = await fetch(`/api/communities/${community.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const data = (await response.json()) as { error?: string };
    setSettingsMessage(response.ok ? "Comunidade atualizada." : (data.error ?? "Falha ao salvar."));
    if (response.ok) router.refresh();
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setInviteMessage(null);
    setGeneratedUrl(null);
    const form = new FormData(formElement);
    const expiration = String(form.get("expiresAt") ?? "");
    const maxUses = String(form.get("maxUses") ?? "");
    const response = await fetch(`/api/communities/${community.id}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresAt: expiration ? new Date(expiration).toISOString() : null,
        maxUses: maxUses ? Number(maxUses) : null,
      }),
    });
    const data = (await response.json()) as { error?: string; url?: string };
    if (!response.ok || !data.url) {
      setInviteMessage(data.error ?? "Falha ao criar convite.");
      return;
    }
    setGeneratedUrl(data.url);
    setInviteMessage("Convite criado. O link completo é exibido somente agora.");
    formElement.reset();
    router.refresh();
  }

  async function revokeInvite(inviteId: string) {
    const response = await fetch(`/api/communities/${community.id}/invites/${inviteId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setInviteMessage(data.error ?? "Falha ao revogar convite.");
      return;
    }
    setInviteMessage("Convite revogado.");
    router.refresh();
  }

  async function copyInvite() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setInviteMessage("Link copiado.");
  }

  return (
    <div className="grid grid-2 profile-grid">
      <section className="card">
        <h2>Informações da comunidade</h2>
        <p className="muted">Visíveis apenas para quem participa.</p>
        <form className="form" onSubmit={saveCommunity}>
          {settingsMessage && (
            <div
              className={settingsMessage.includes("atualizada") ? "success" : "error"}
              role={settingsMessage.includes("atualizada") ? "status" : "alert"}
            >
              {settingsMessage}
            </div>
          )}
          <div className="field">
            <label htmlFor="settings-name">Nome</label>
            <input id="settings-name" name="name" defaultValue={community.name} required />
          </div>
          <div className="field">
            <label htmlFor="settings-description">Descrição</label>
            <textarea
              id="settings-description"
              name="description"
              defaultValue={community.description ?? ""}
              rows={4}
              maxLength={1000}
            />
          </div>
          <div className="field">
            <label htmlFor="settings-avatar">URL do avatar</label>
            <input
              id="settings-avatar"
              name="avatarUrl"
              type="url"
              defaultValue={community.avatarUrl ?? ""}
            />
          </div>
          <button className="button" type="submit">
            Salvar alterações
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Novo convite</h2>
        <p className="muted">O token não é armazenado em texto puro e só aparece uma vez.</p>
        <form className="form" onSubmit={createInvite}>
          {inviteMessage && (
            <div
              className={inviteMessage.includes("Falha") ? "error" : "success"}
              role={inviteMessage.includes("Falha") ? "alert" : "status"}
            >
              {inviteMessage}
            </div>
          )}
          <div className="field">
            <label htmlFor="invite-expiration">Expira em (opcional)</label>
            <input id="invite-expiration" name="expiresAt" type="datetime-local" />
          </div>
          <div className="field">
            <label htmlFor="invite-max-uses">Limite de usos (opcional)</label>
            <input id="invite-max-uses" name="maxUses" type="number" min={1} max={100} />
          </div>
          <button className="button" type="submit">
            Gerar link de convite
          </button>
        </form>
        {generatedUrl && (
          <div className="generated-link">
            <code>{generatedUrl}</code>
            <button className="button secondary" type="button" onClick={copyInvite}>
              Copiar
            </button>
          </div>
        )}
      </section>

      <section className="card full-span">
        <div className="card-header">
          <div>
            <h2>Convites gerados</h2>
            <p className="muted small">Por segurança, links antigos não podem ser recuperados.</p>
          </div>
          <span className="pill">{invites.length}</span>
        </div>
        <div className="member-list">
          {invites.map((invite) => {
            const expired = invite.expiresAt ? new Date(invite.expiresAt) <= new Date() : false;
            const exhausted = invite.maxUses != null && invite.useCount >= invite.maxUses;
            const active =
              invite.status === "ACTIVE" && !invite.revokedAt && !expired && !exhausted;
            return (
              <div className="member-row" key={invite.id}>
                <div>
                  <strong>{active ? "Convite ativo" : "Convite encerrado"}</strong>
                  <div className="muted small">
                    Criado por {invite.createdBy.name} · {invite.useCount}/{invite.maxUses ?? "∞"}{" "}
                    usos
                    {invite.expiresAt
                      ? ` · expira ${new Date(invite.expiresAt).toLocaleString("pt-BR")}`
                      : ""}
                  </div>
                </div>
                <span className={`status-dot ${active ? "active" : "inactive"}`}>
                  {active ? "Ativo" : "Encerrado"}
                </span>
                {active && (
                  <button
                    className="button danger-outline"
                    type="button"
                    onClick={() => revokeInvite(invite.id)}
                  >
                    Revogar
                  </button>
                )}
              </div>
            );
          })}
          {!invites.length && <p className="muted">Nenhum convite gerado.</p>}
        </div>
      </section>
    </div>
  );
}
