"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AvailabilityStatus } from "@prisma/client";
import {
  addCivilDays,
  civilDateInTimeZone,
  dateTimeLocalInTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/dates/civil-date";
import {
  availabilityStatusLabels,
  editableAvailabilityStatuses,
  statusClass,
} from "@/features/availability/status";

type OverrideItem = {
  id: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  status: AvailabilityStatus;
  note: string | null;
};

export function AvailabilityForms({
  communityId,
  timezone,
  initialDate,
  overrides,
}: {
  communityId: string;
  timezone: string;
  initialDate: string;
  overrides: OverrideItem[];
}) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(true);
  const [period, setPeriod] = useState<"MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM">("MORNING");
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage(null);
    const form = new FormData(formElement);
    const note = String(form.get("note") ?? "").trim() || null;
    const status = String(form.get("status"));
    let body: Record<string, unknown>;

    if (allDay) {
      body = {
        allDay: true,
        startDate: String(form.get("startDate")),
        endDate: String(form.get("endDate")),
        timezone,
        status,
        note,
      };
    } else {
      const periodDate = String(form.get("periodDate"));
      const customStart = String(form.get("startAt"));
      const customEnd = String(form.get("endAt"));
      const [startDate, startTime, endDate, endTime] =
        period === "CUSTOM"
          ? [
              customStart.slice(0, 10),
              customStart.slice(11),
              customEnd.slice(0, 10),
              customEnd.slice(11),
            ]
          : period === "MORNING"
            ? [periodDate, "06:00", periodDate, "12:00"]
            : period === "AFTERNOON"
              ? [periodDate, "12:00", periodDate, "18:00"]
              : [periodDate, "18:00", addCivilDays(periodDate, 1), "00:00"];
      const startAt = zonedDateTimeToUtc(startDate, startTime, timezone);
      const endAt = zonedDateTimeToUtc(endDate, endTime, timezone);
      body = {
        allDay: false,
        startAt: Number.isNaN(startAt.getTime()) ? "" : startAt.toISOString(),
        endAt: Number.isNaN(endAt.getTime()) ? "" : endAt.toISOString(),
        status,
        note,
      };
    }

    const response = await fetch(`/api/communities/${communityId}/availability`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: result.error ?? "Não foi possível salvar." });
      return;
    }
    setMessage({ kind: "success", text: "Disponibilidade adicionada." });
    formElement.reset();
    setAllDay(true);
    setPeriod("MORNING");
    router.refresh();
  }

  async function remove(overrideId: string) {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/communities/${communityId}/availability/${overrideId}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage({ kind: "error", text: result.error ?? "Não foi possível remover." });
      return;
    }
    setMessage({ kind: "success", text: "Registro removido." });
    router.refresh();
  }

  async function update(event: FormEvent<HTMLFormElement>, item: OverrideItem) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    let body: Record<string, unknown>;
    if (item.allDay) {
      body = {
        allDay: true,
        startDate: String(form.get("startDate")),
        endDate: String(form.get("endDate")),
        timezone,
        status: String(form.get("status")),
        note: String(form.get("note") ?? "").trim() || null,
      };
    } else {
      const start = String(form.get("startAt"));
      const end = String(form.get("endAt"));
      body = {
        allDay: false,
        startAt: zonedDateTimeToUtc(start.slice(0, 10), start.slice(11), timezone).toISOString(),
        endAt: zonedDateTimeToUtc(end.slice(0, 10), end.slice(11), timezone).toISOString(),
        status: String(form.get("status")),
        note: String(form.get("note") ?? "").trim() || null,
      };
    }
    const response = await fetch(`/api/communities/${communityId}/availability/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: result.error ?? "Não foi possível atualizar." });
      return;
    }
    setEditingId(null);
    setMessage({ kind: "success", text: "Ocorrência atualizada." });
    router.refresh();
  }

  const dateTimeDefault = `${initialDate}T09:00`;
  const dateTimeEndDefault = `${initialDate}T18:00`;

  return (
    <div className="grid grid-2 availability-editor">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Adicionar ocorrência</h2>
            <p className="muted small">Folga, férias, trabalho ou disponibilidade manual.</p>
          </div>
          <span>✍️</span>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="toggle-row">
            <input
              checked={allDay}
              name="allDay"
              onChange={(event) => setAllDay(event.target.checked)}
              type="checkbox"
            />
            Dia inteiro
          </label>
          {allDay ? (
            <div className="form-row">
              <div className="field">
                <label htmlFor="override-start-date">Data inicial</label>
                <input
                  id="override-start-date"
                  name="startDate"
                  defaultValue={initialDate}
                  type="date"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="override-end-date">Data final</label>
                <input
                  id="override-end-date"
                  name="endDate"
                  defaultValue={initialDate}
                  type="date"
                  required
                />
              </div>
            </div>
          ) : (
            <>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="override-period">Período</label>
                  <select
                    id="override-period"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value as typeof period)}
                  >
                    <option value="MORNING">Manhã · 6h–12h</option>
                    <option value="AFTERNOON">Tarde · 12h–18h</option>
                    <option value="EVENING">Noite · após 18h</option>
                    <option value="CUSTOM">Intervalo personalizado</option>
                  </select>
                </div>
                {period !== "CUSTOM" && (
                  <div className="field">
                    <label htmlFor="override-period-date">Data</label>
                    <input
                      id="override-period-date"
                      name="periodDate"
                      defaultValue={initialDate}
                      type="date"
                      required
                    />
                  </div>
                )}
              </div>
              {period === "CUSTOM" && (
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="override-start-at">Início</label>
                    <input
                      id="override-start-at"
                      name="startAt"
                      defaultValue={dateTimeDefault}
                      type="datetime-local"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="override-end-at">Fim</label>
                    <input
                      id="override-end-at"
                      name="endAt"
                      defaultValue={dateTimeEndDefault}
                      type="datetime-local"
                      required
                    />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="field">
            <label htmlFor="override-status">Status</label>
            <select
              id="override-status"
              key={String(allDay)}
              name="status"
              defaultValue={allDay ? "DAY_OFF" : "PARTIALLY_AVAILABLE"}
            >
              {editableAvailabilityStatuses.map((status) => (
                <option key={status} value={status}>
                  {availabilityStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="override-note">Observação opcional</label>
            <textarea id="override-note" maxLength={500} name="note" rows={2} />
          </div>
          <p className="field-help">Todos os horários são interpretados em {timezone}.</p>
          {message && (
            <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}
          <button className="button" disabled={pending} type="submit">
            {pending ? "Salvando…" : "Adicionar à agenda"}
          </button>
        </form>
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Ocorrências manuais</h2>
            <p className="muted small">Sempre prevalecem sobre a escala recorrente.</p>
          </div>
          <span>{overrides.length}</span>
        </div>
        {overrides.length ? (
          <div className="override-list">
            {overrides.map((item) => (
              <article className="override-row" key={item.id}>
                <div>
                  <span className={`availability-badge ${statusClass(item.status)}`}>
                    {availabilityStatusLabels[item.status]}
                  </span>
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      timeZone: timezone,
                      dateStyle: "medium",
                      ...(item.allDay ? {} : { timeStyle: "short" }),
                    }).format(new Date(item.startAt))}
                  </strong>
                  {item.note && <span className="muted small">{item.note}</span>}
                </div>
                <div className="member-actions">
                  <button
                    className="button ghost"
                    disabled={pending}
                    onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    type="button"
                  >
                    {editingId === item.id ? "Cancelar" : "Editar"}
                  </button>
                  <button
                    className="button danger-outline"
                    disabled={pending}
                    onClick={() => remove(item.id)}
                    type="button"
                  >
                    Remover
                  </button>
                </div>
                {editingId === item.id && (
                  <form className="form inline-edit-form" onSubmit={(event) => update(event, item)}>
                    {item.allDay ? (
                      <div className="form-row">
                        <div className="field">
                          <label htmlFor={`edit-override-start-${item.id}`}>Data inicial</label>
                          <input
                            defaultValue={civilDateInTimeZone(new Date(item.startAt), timezone)}
                            id={`edit-override-start-${item.id}`}
                            name="startDate"
                            required
                            type="date"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-override-end-${item.id}`}>Data final</label>
                          <input
                            defaultValue={addCivilDays(
                              civilDateInTimeZone(new Date(item.endAt), timezone),
                              -1,
                            )}
                            id={`edit-override-end-${item.id}`}
                            name="endDate"
                            required
                            type="date"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="form-row">
                        <div className="field">
                          <label htmlFor={`edit-override-start-${item.id}`}>Início</label>
                          <input
                            defaultValue={dateTimeLocalInTimeZone(new Date(item.startAt), timezone)}
                            id={`edit-override-start-${item.id}`}
                            name="startAt"
                            required
                            type="datetime-local"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-override-end-${item.id}`}>Fim</label>
                          <input
                            defaultValue={dateTimeLocalInTimeZone(new Date(item.endAt), timezone)}
                            id={`edit-override-end-${item.id}`}
                            name="endAt"
                            required
                            type="datetime-local"
                          />
                        </div>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor={`edit-override-status-${item.id}`}>Status</label>
                      <select
                        defaultValue={item.status}
                        id={`edit-override-status-${item.id}`}
                        name="status"
                      >
                        {editableAvailabilityStatuses.map((status) => (
                          <option key={status} value={status}>
                            {availabilityStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-override-note-${item.id}`}>Observação</label>
                      <textarea
                        defaultValue={item.note ?? ""}
                        id={`edit-override-note-${item.id}`}
                        maxLength={500}
                        name="note"
                        rows={2}
                      />
                    </div>
                    <button className="button" disabled={pending} type="submit">
                      Salvar alterações
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <span className="empty-icon">🗓️</span>
            <p>Você ainda não adicionou ocorrências manuais.</p>
          </div>
        )}
      </section>
    </div>
  );
}
