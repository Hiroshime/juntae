"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type Member = {
  userId: string;
  displayName: string | null;
  role: Role;
  joinedAt: Date | string;
  user: {
    name: string;
    avatarUrl: string | null;
    timezone: string;
    lastLoginAt?: Date | string | null;
  };
};

const roleLabels: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Administrador",
  MEMBER: "Membro",
};

function formatLastLogin(value: Date | string | null | undefined) {
  if (!value) return "Ainda não registrado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(new Date(value))
    .replace(",", "");
}

export function MemberManagement({
  communityId,
  currentUserId,
  currentRole,
  members,
}: {
  communityId: string;
  currentUserId: string;
  currentRole: Role;
  members: Member[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function changeRole(userId: string, role: Role) {
    setMessage(null);
    const response = await fetch(`/api/communities/${communityId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = (await response.json()) as { error?: string };
    setMessage(response.ok ? "Papel atualizado." : (data.error ?? "Falha ao atualizar papel."));
    if (response.ok) router.refresh();
  }

  async function remove(userId: string, name: string) {
    if (!window.confirm(`Remover ${name} da comunidade?`)) return;
    const response = await fetch(`/api/communities/${communityId}/members/${userId}`, {
      method: "DELETE",
    });
    const data = response.status === 204 ? {} : ((await response.json()) as { error?: string });
    setMessage(response.ok ? "Membro removido." : (data.error ?? "Falha ao remover."));
    if (response.ok) router.refresh();
  }

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>Pessoas da comunidade</h2>
          <p className="muted small">E-mails não são expostos nesta listagem.</p>
        </div>
        <span className="pill">{members.length} membros</span>
      </div>
      {message && (
        <div
          className={message.includes("Falha") ? "error" : "success"}
          role={message.includes("Falha") ? "alert" : "status"}
        >
          {message}
        </div>
      )}
      <div className="member-list">
        {members.map((member) => {
          const own = member.userId === currentUserId;
          const canManage =
            !own &&
            currentRole !== "MEMBER" &&
            !(currentRole === "ADMIN" && member.role === "OWNER");
          const name = member.displayName ?? member.user.name;
          return (
            <div className="member-row" key={member.userId}>
              <Avatar name={name} url={member.user.avatarUrl} />
              <div className="member-info">
                <strong>
                  {name}
                  {own ? " (você)" : ""}
                </strong>
                <span className="muted small">
                  {member.user.timezone} · desde{" "}
                  {new Date(member.joinedAt).toLocaleDateString("pt-BR")}
                </span>
                {currentRole !== "MEMBER" && (
                  <span className="muted small">
                    Último login: {formatLastLogin(member.user.lastLoginAt)}
                  </span>
                )}
              </div>
              <span className={`role-badge role-${member.role.toLowerCase()}`}>
                {roleLabels[member.role]}
              </span>
              {canManage && (
                <div className="member-actions">
                  <select
                    aria-label={`Papel de ${name}`}
                    value={member.role}
                    onChange={(event) => changeRole(member.userId, event.target.value as Role)}
                  >
                    <option value="MEMBER">Membro</option>
                    <option value="ADMIN">Administrador</option>
                    {currentRole === "OWNER" && <option value="OWNER">Owner</option>}
                  </select>
                  <button
                    className="button danger-outline"
                    type="button"
                    onClick={() => remove(member.userId, name)}
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
