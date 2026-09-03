"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RsvpStatus } from "@prisma/client";
import { rsvpStatusLabels } from "@/features/events/status";

export function EventActions({
  communityId,
  communitySlug,
  eventId,
  currentRsvp,
  canManage,
  acceptsRsvp,
}: {
  communityId: string;
  communitySlug: string;
  eventId: string;
  currentRsvp: RsvpStatus | null;
  canManage: boolean;
  acceptsRsvp: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rsvp(status: RsvpStatus) {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/communities/${communityId}/events/${eventId}/rsvp`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "Não foi possível registrar sua resposta.");
      return;
    }
    router.refresh();
  }

  async function cancel() {
    if (!window.confirm("Cancelar este evento? As respostas serão preservadas.")) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/communities/${communityId}/events/${eventId}/cancel`, {
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "Não foi possível cancelar o evento.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="event-actions">
      {acceptsRsvp && (
        <div>
          <strong>Você vai?</strong>
          <div className="rsvp-buttons" role="group" aria-label="Sua resposta">
            {(["GOING", "MAYBE", "NOT_GOING"] as const).map((status) => (
              <button
                aria-pressed={currentRsvp === status}
                className={`button ${currentRsvp === status ? "" : "secondary"}`}
                disabled={pending}
                key={status}
                onClick={() => rsvp(status)}
                type="button"
              >
                {rsvpStatusLabels[status]}
              </button>
            ))}
          </div>
        </div>
      )}
      {canManage && (
        <div className="actions compact-actions">
          {acceptsRsvp && (
            <button
              className="button secondary"
              onClick={() => router.push(`/app/${communitySlug}/events/${eventId}/edit`)}
              type="button"
            >
              Editar
            </button>
          )}
          {acceptsRsvp && (
            <button
              className="button danger-outline"
              disabled={pending}
              onClick={cancel}
              type="button"
            >
              Cancelar evento
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
