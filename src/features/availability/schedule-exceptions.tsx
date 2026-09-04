"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";

type Holiday = { id: string; name: string; date: string };
type ExtraDay = { id: string; startAt: string; endAt: string; note: string | null };

export function ScheduleExceptions({
  communityId,
  initialDate,
  timezone,
  canManageHolidays,
  holidays,
  extraDays,
}: {
  communityId: string;
  initialDate: string;
  timezone: string;
  canManageHolidays: boolean;
  holidays: Holiday[];
  extraDays: ExtraDay[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação.");
  }

  async function createExtraDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setMessage(null);
    try {
      await request(`/api/communities/${communityId}/availability`, "POST", {
        allDay: true,
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        timezone,
        status: "DAY_OFF",
        note: String(data.get("note") ?? "").trim() || "Folga extra",
      });
      form.reset();
      setMessage({ kind: "success", text: "Folga extra adicionada à sua agenda." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setPending(false);
    }
  }

  async function createHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setMessage(null);
    try {
      await request(`/api/communities/${communityId}/holidays`, "POST", {
        name: String(data.get("name")),
        date: String(data.get("date")),
      });
      form.reset();
      setMessage({ kind: "success", text: "Feriado adicionado ao calendário." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setPending(false);
    }
  }

  async function remove(url: string, success: string) {
    setPending(true);
    setMessage(null);
    try {
      await request(url, "DELETE");
      setMessage({ kind: "success", text: success });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao remover.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="schedule-exceptions">
      <div className="page-heading compact-heading">
        <div>
          <div className="eyebrow">Exceções da rotina</div>
          <h2>Feriados e folgas extras</h2>
          <p className="muted">
            Feriados são informativos. Folgas extras alteram sua disponibilidade e prevalecem sobre
            a escala recorrente.
          </p>
        </div>
      </div>
      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
      <div className="grid grid-2">
        <section className="card">
          <h3>Minha folga extra</h3>
          <form className="form" onSubmit={createExtraDay}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="extra-day-start">Data inicial</label>
                <input
                  id="extra-day-start"
                  name="startDate"
                  defaultValue={initialDate}
                  type="date"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="extra-day-end">Data final</label>
                <input
                  id="extra-day-end"
                  name="endDate"
                  defaultValue={initialDate}
                  type="date"
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="extra-day-note">Motivo ou observação</label>
              <input
                id="extra-day-note"
                name="note"
                maxLength={500}
                placeholder="Folga prêmio, banco de horas…"
              />
            </div>
            <button className="button" disabled={pending} type="submit">
              Adicionar folga extra
            </button>
          </form>
          <div className="exception-list">
            {extraDays.map((day) => {
              const start = civilDateInTimeZone(new Date(day.startAt), timezone);
              const end = addCivilDays(civilDateInTimeZone(new Date(day.endAt), timezone), -1);
              return (
                <div className="exception-row" key={day.id}>
                  <div>
                    <strong>{start === end ? start : `${start} a ${end}`}</strong>
                    <span>{day.note || "Folga extra"}</span>
                  </div>
                  <button
                    className="button danger-outline"
                    disabled={pending}
                    onClick={() =>
                      remove(
                        `/api/communities/${communityId}/availability/${day.id}`,
                        "Folga extra removida.",
                      )
                    }
                    type="button"
                  >
                    Remover
                  </button>
                </div>
              );
            })}
            {!extraDays.length && <p className="muted small">Nenhuma folga extra cadastrada.</p>}
          </div>
        </section>
        <section className="card">
          <h3>Feriados da comunidade</h3>
          {canManageHolidays ? (
            <form className="form" onSubmit={createHoliday}>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="holiday-name">Nome</label>
                  <input
                    id="holiday-name"
                    name="name"
                    maxLength={120}
                    placeholder="Consciência Negra"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="holiday-date">Data</label>
                  <input
                    id="holiday-date"
                    name="date"
                    defaultValue={initialDate}
                    type="date"
                    required
                  />
                </div>
              </div>
              <button className="button secondary" disabled={pending} type="submit">
                Adicionar feriado
              </button>
            </form>
          ) : (
            <p className="muted small">Somente administradores podem cadastrar feriados.</p>
          )}
          <div className="exception-list">
            {holidays.map((holiday) => (
              <div className="exception-row" key={holiday.id}>
                <div>
                  <strong>{holiday.date}</strong>
                  <span>{holiday.name}</span>
                </div>
                {canManageHolidays && (
                  <button
                    className="button danger-outline"
                    disabled={pending}
                    onClick={() =>
                      remove(
                        `/api/communities/${communityId}/holidays/${holiday.id}`,
                        "Feriado removido.",
                      )
                    }
                    type="button"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            {!holidays.length && <p className="muted small">Nenhum feriado cadastrado.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
