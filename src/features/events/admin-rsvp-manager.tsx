"use client";

import type { RsvpStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { rsvpStatusLabels } from "@/features/events/status";

type RsvpMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: RsvpStatus | null;
  attendingSpecificDays: boolean;
  attendanceDates: string[];
};

export function AdminRsvpManager({
  communityId,
  eventId,
  allowMaybe,
  members,
}: {
  communityId: string;
  eventId: string;
  allowMaybe: boolean;
  members: RsvpMember[];
}) {
  const router = useRouter();
  const initialStatuses = Object.fromEntries(
    members.map((member) => [member.userId, member.status ?? ""]),
  );
  const [draftStatuses, setDraftStatuses] = useState<Record<string, string>>(initialStatuses);
  const [savedStatuses, setSavedStatuses] = useState<Record<string, string>>(initialStatuses);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const statuses: RsvpStatus[] = allowMaybe
    ? ["GOING", "MAYBE", "NOT_GOING"]
    : ["GOING", "NOT_GOING"];

  async function save(member: RsvpMember) {
    const status = draftStatuses[member.userId] as RsvpStatus | "";
    if (!status || status === savedStatuses[member.userId]) return;
    setPendingUserId(member.userId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/events/${eventId}/rsvps/${member.userId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? `Não foi possível alterar a resposta de ${member.name}.`);
        return;
      }
      setSavedStatuses((current) => ({ ...current, [member.userId]: status }));
      setSuccess(`${member.name}: resposta alterada para “${rsvpStatusLabels[status]}”.`);
      router.refresh();
    } catch {
      setError(`Não foi possível alterar a resposta de ${member.name}. Tente novamente.`);
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <details className="card admin-rsvp-manager">
      <summary>
        <span>
          <strong>Gerenciar respostas</strong>
          <small>Responder ou corrigir a participação em nome dos membros.</small>
        </span>
        <span className="small muted">Somente administração</span>
      </summary>
      <div className="admin-rsvp-content">
        <p className="muted small">
          Alterações entre “Vou” e “Talvez” preservam os dias específicos já escolhidos. “Não vou”
          remove esses dias.
        </p>
        <div className="admin-rsvp-list">
          {members.map((member) => {
            const selectId = `admin-rsvp-${member.userId}`;
            const draftStatus = draftStatuses[member.userId] ?? "";
            return (
              <div className="admin-rsvp-row" key={member.userId}>
                <div className="admin-rsvp-person">
                  <Avatar name={member.name} url={member.avatarUrl} size="small" />
                  <span>
                    <strong>{member.name}</strong>
                    <small>
                      {savedStatuses[member.userId]
                        ? rsvpStatusLabels[savedStatuses[member.userId] as RsvpStatus]
                        : "Sem resposta"}
                      {savedStatuses[member.userId] !== "NOT_GOING" &&
                      member.attendingSpecificDays &&
                      member.attendanceDates.length
                        ? ` · ${member.attendanceDates.length} dia(s) específico(s)`
                        : ""}
                    </small>
                  </span>
                </div>
                <div className="admin-rsvp-control">
                  <label className="sr-only" htmlFor={selectId}>
                    Resposta de {member.name}
                  </label>
                  <select
                    disabled={pendingUserId !== null}
                    id={selectId}
                    onChange={(event) =>
                      setDraftStatuses((current) => ({
                        ...current,
                        [member.userId]: event.target.value,
                      }))
                    }
                    value={draftStatus}
                  >
                    <option disabled value="">
                      Sem resposta — selecione
                    </option>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {rsvpStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    disabled={
                      pendingUserId !== null ||
                      !draftStatus ||
                      draftStatus === savedStatuses[member.userId]
                    }
                    onClick={() => save(member)}
                    type="button"
                  >
                    {pendingUserId === member.userId ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="success" role="status">
            {success}
          </div>
        )}
      </div>
    </details>
  );
}
