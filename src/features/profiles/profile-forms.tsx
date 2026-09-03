"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  timezone: string;
};

type Membership = {
  communityId: string;
  displayName: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  community: { name: string; slug: string };
};

const timezones = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "UTC",
];

export function ProfileForms({
  profile,
  memberships,
}: {
  profile: Profile;
  memberships: Membership[];
}) {
  const router = useRouter();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = (await response.json()) as { error?: string };
    setProfileMessage(response.ok ? "Perfil atualizado." : (data.error ?? "Falha ao atualizar."));
    if (response.ok) router.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPasswordMessage(null);
    const form = new FormData(formElement);
    const response = await fetch("/api/users/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = (await response.json()) as { error?: string };
    setPasswordMessage(
      response.ok ? "Senha alterada com segurança." : (data.error ?? "Falha ao alterar."),
    );
    if (response.ok) formElement.reset();
  }

  return (
    <div className="grid grid-2 profile-grid">
      <section className="card">
        <h2>Perfil pessoal</h2>
        <p className="muted">Esses dados acompanham você em todas as comunidades.</p>
        <form className="form" onSubmit={saveProfile}>
          {profileMessage && (
            <div
              className={profileMessage.includes("atualizado") ? "success" : "error"}
              role={profileMessage.includes("atualizado") ? "status" : "alert"}
            >
              {profileMessage}
            </div>
          )}
          <div className="field">
            <label htmlFor="profile-name">Nome</label>
            <input id="profile-name" name="name" defaultValue={profile.name} required />
          </div>
          <div className="field">
            <label htmlFor="profile-email">E-mail</label>
            <input id="profile-email" value={profile.email} disabled />
            <span className="field-help">O e-mail de acesso não é alterado nesta fase.</span>
          </div>
          <div className="field">
            <label htmlFor="profile-avatar">URL do avatar</label>
            <input
              id="profile-avatar"
              name="avatarUrl"
              type="url"
              defaultValue={profile.avatarUrl ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="profile-timezone">Timezone</label>
            <select id="profile-timezone" name="timezone" defaultValue={profile.timezone}>
              {timezones.includes(profile.timezone) || (
                <option value={profile.timezone}>{profile.timezone}</option>
              )}
              {timezones.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </select>
          </div>
          <button className="button" type="submit">
            Salvar perfil
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Segurança</h2>
        <p className="muted">Use uma senha exclusiva com pelo menos 8 caracteres.</p>
        <form className="form" onSubmit={changePassword}>
          {passwordMessage && (
            <div
              className={passwordMessage.includes("segurança") ? "success" : "error"}
              role={passwordMessage.includes("segurança") ? "status" : "alert"}
            >
              {passwordMessage}
            </div>
          )}
          <div className="field">
            <label htmlFor="current-password">Senha atual</label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <button className="button secondary" type="submit">
            Alterar senha
          </button>
        </form>
      </section>

      <section className="card full-span">
        <h2>Nomes nas comunidades</h2>
        <p className="muted">Defina um nome diferente em cada grupo, se quiser.</p>
        <div className="member-list">
          {memberships.map((membership) => (
            <CommunityDisplayNameForm
              key={membership.communityId}
              membership={membership}
              userId={profile.id}
            />
          ))}
          {!memberships.length && <p className="muted">Você ainda não participa de comunidades.</p>}
        </div>
      </section>
    </div>
  );
}

function CommunityDisplayNameForm({
  membership,
  userId,
}: {
  membership: Membership;
  userId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/communities/${membership.communityId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: form.get("displayName") }),
    });
    const data = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Salvo." : (data.error ?? "Falha ao salvar."));
    if (response.ok) router.refresh();
  }

  return (
    <form className="inline-form member-row" onSubmit={submit}>
      <div>
        <strong>{membership.community.name}</strong>
        <div className="muted small">{membership.role}</div>
      </div>
      <input
        name="displayName"
        defaultValue={membership.displayName ?? ""}
        placeholder="Usar nome pessoal"
        aria-label={`Nome em ${membership.community.name}`}
      />
      <button className="button secondary" type="submit">
        Salvar
      </button>
      {message && (
        <span className="small muted" role="status">
          {message}
        </span>
      )}
    </form>
  );
}
