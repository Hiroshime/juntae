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
  currentAttendanceIsPartial,
  initialAttendanceDates,
  attendanceDates,
  allowMaybe,
  allowPartialAttendance,
  canManage,
  acceptsRsvp,
}: {
  communityId: string;
  communitySlug: string;
  eventId: string;
  currentRsvp: RsvpStatus | null;
  currentAttendanceIsPartial: boolean;
  initialAttendanceDates: string[];
  attendanceDates: string[];
  allowMaybe: boolean;
  allowPartialAttendance: boolean;
  canManage: boolean;
  acceptsRsvp: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specificDays, setSpecificDays] = useState(currentAttendanceIsPartial);
  const [selectedDates, setSelectedDates] = useState(() => new Set(initialAttendanceDates));
  const responseStatuses: RsvpStatus[] = allowMaybe
    ? ["GOING", "MAYBE", "NOT_GOING"]
    : ["GOING", "NOT_GOING"];

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function rsvp(status: RsvpStatus) {
    if (status !== "NOT_GOING" && specificDays && selectedDates.size === 0) {
      setError("Selecione pelo menos um dia ou escolha o evento inteiro.");
      return;
    }
    setPending(true);
    setError(null);
    const response = await fetch(`/api/communities/${communityId}/events/${eventId}/rsvp`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        attendanceDates:
          status !== "NOT_GOING" && specificDays ? Array.from(selectedDates).sort() : null,
      }),
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
          {allowPartialAttendance && attendanceDates.length > 1 && (
            <div className="partial-attendance-picker">
              <label className="toggle-row compact-toggle">
                <input
                  checked={specificDays}
                  disabled={pending}
                  onChange={(event) => setSpecificDays(event.target.checked)}
                  type="checkbox"
                />
                Vou somente em alguns dias
              </label>
              {specificDays && (
                <fieldset>
                  <legend>Em quais dias?</legend>
                  <div className="attendance-day-grid">
                    {attendanceDates.map((date) => (
                      <label key={date}>
                        <input
                          checked={selectedDates.has(date)}
                          disabled={pending}
                          onChange={() => toggleDate(date)}
                          type="checkbox"
                        />
                        <span>
                          {new Intl.DateTimeFormat("pt-BR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            timeZone: "UTC",
                          }).format(new Date(`${date}T00:00:00Z`))}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
          <div className="rsvp-buttons" role="group" aria-label="Sua resposta">
            {responseStatuses.map((status) => (
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
          {!allowMaybe && <small className="muted">O organizador desativou “Talvez”.</small>}
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
