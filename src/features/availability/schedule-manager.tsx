"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { availabilityStatusLabels, statusClass } from "@/features/availability/status";

const weekdays = [
  ["monday", "Seg"],
  ["tuesday", "Ter"],
  ["wednesday", "Qua"],
  ["thursday", "Qui"],
  ["friday", "Sex"],
  ["saturday", "Sáb"],
  ["sunday", "Dom"],
] as const;

type Rule = {
  id: string;
  name: string;
  ruleType: "WEEKLY" | "CYCLE";
  anchorDate: string | null;
  workDays: number | null;
  restDays: number | null;
  weeklyPattern: Record<string, "WORKING" | "DAY_OFF"> | null;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "INACTIVE";
};

function payloadFromForm(
  form: FormData,
  ruleType: "WEEKLY" | "CYCLE",
  status: Rule["status"] = "ACTIVE",
) {
  const common = {
    name: String(form.get("name")),
    ruleType,
    startDate: String(form.get("startDate")),
    endDate: String(form.get("endDate") ?? ""),
    status,
  };
  if (ruleType === "CYCLE") {
    return {
      ...common,
      anchorDate: String(form.get("anchorDate")),
      workDays: Number(form.get("workDays")),
      restDays: Number(form.get("restDays")),
    };
  }
  return {
    ...common,
    weeklyPattern: Object.fromEntries(
      weekdays.map(([day]) => [day, form.get(day) ? "WORKING" : "DAY_OFF"]),
    ),
  };
}

function payloadFromRule(rule: Rule, status: Rule["status"]) {
  const common = {
    name: rule.name,
    ruleType: rule.ruleType,
    startDate: rule.startDate,
    endDate: rule.endDate ?? "",
    status,
  };
  return rule.ruleType === "CYCLE"
    ? {
        ...common,
        anchorDate: rule.anchorDate,
        workDays: rule.workDays,
        restDays: rule.restDays,
      }
    : { ...common, weeklyPattern: rule.weeklyPattern };
}

export function ScheduleManager({
  communityId,
  initialDate,
  schedules,
  holidays,
}: {
  communityId: string;
  initialDate: string;
  schedules: Rule[];
  holidays: Array<{ date: string; name: string }>;
}) {
  const router = useRouter();
  const [ruleType, setRuleType] = useState<"WEEKLY" | "CYCLE">("CYCLE");
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [preview, setPreview] = useState<
    Array<{ date: string; status: "WORKING" | "DAY_OFF" | "UNKNOWN" }>
  >([]);

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      preview?: typeof preview;
    };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação.");
    return result;
  }

  async function previewRule(form: HTMLFormElement) {
    setPending(true);
    setMessage(null);
    const rule = payloadFromForm(new FormData(form), ruleType);
    try {
      const result = await request(`/api/communities/${communityId}/schedules/preview`, "POST", {
        rule,
        startDate: rule.startDate,
        endDate: addDays(rule.startDate, 13),
      });
      setPreview(result.preview ?? []);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha na prévia.",
      });
    } finally {
      setPending(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage(null);
    try {
      await request(
        `/api/communities/${communityId}/schedules`,
        "POST",
        payloadFromForm(new FormData(formElement), ruleType),
      );
      setMessage({ kind: "success", text: "Escala recorrente criada." });
      setPreview([]);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao criar.",
      });
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(rule: Rule) {
    setPending(true);
    setMessage(null);
    try {
      const status = rule.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await request(
        `/api/communities/${communityId}/schedules/${rule.id}`,
        "PATCH",
        payloadFromRule(rule, status),
      );
      setMessage({
        kind: "success",
        text: status === "ACTIVE" ? "Escala ativada." : "Escala pausada.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao atualizar.",
      });
    } finally {
      setPending(false);
    }
  }

  async function remove(ruleId: string) {
    setPending(true);
    setMessage(null);
    try {
      await request(`/api/communities/${communityId}/schedules/${ruleId}`, "DELETE");
      setMessage({ kind: "success", text: "Escala removida." });
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

  async function update(event: FormEvent<HTMLFormElement>, rule: Rule) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await request(
        `/api/communities/${communityId}/schedules/${rule.id}`,
        "PATCH",
        payloadFromForm(new FormData(event.currentTarget), rule.ruleType, rule.status),
      );
      setEditingId(null);
      setMessage({ kind: "success", text: "Escala atualizada." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao atualizar.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid schedule-layout">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Nova escala recorrente</h2>
            <p className="muted small">Use uma semana padrão ou qualquer ciclo N×M.</p>
          </div>
          <span>🔁</span>
        </div>
        <form className="form" onSubmit={create} onReset={() => setPreview([])}>
          <div className="field">
            <label htmlFor="schedule-name">Nome da escala</label>
            <input id="schedule-name" name="name" placeholder="Plantão 12x36" required />
          </div>
          <div className="field">
            <label htmlFor="schedule-type">Tipo</label>
            <select
              id="schedule-type"
              name="ruleType"
              value={ruleType}
              onChange={(event) => setRuleType(event.target.value as typeof ruleType)}
            >
              <option value="CYCLE">Alternância N×M</option>
              <option value="WEEKLY">Semanal</option>
            </select>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="schedule-start">Data inicial</label>
              <input
                id="schedule-start"
                name="startDate"
                defaultValue={initialDate}
                type="date"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="schedule-end">Data final opcional</label>
              <input id="schedule-end" name="endDate" type="date" />
            </div>
          </div>
          {ruleType === "CYCLE" ? (
            <div className="form-row cycle-fields">
              <div className="field">
                <label htmlFor="schedule-anchor">Primeiro dia do ciclo</label>
                <input
                  id="schedule-anchor"
                  name="anchorDate"
                  defaultValue={initialDate}
                  type="date"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="schedule-work-days">Dias trabalhando</label>
                <input
                  id="schedule-work-days"
                  min={1}
                  max={30}
                  name="workDays"
                  defaultValue={1}
                  type="number"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="schedule-rest-days">Dias de folga</label>
                <input
                  id="schedule-rest-days"
                  min={1}
                  max={30}
                  name="restDays"
                  defaultValue={1}
                  type="number"
                  required
                />
              </div>
            </div>
          ) : (
            <fieldset className="weekday-picker">
              <legend>Dias de trabalho</legend>
              {weekdays.map(([day, label], index) => (
                <label key={day}>
                  <input defaultChecked={index < 5} name={day} type="checkbox" />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {message && (
            <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
              {message.text}
            </div>
          )}
          <div className="actions compact-actions">
            <button
              className="button secondary"
              disabled={pending}
              onClick={(event) => void previewRule(event.currentTarget.form!)}
              type="button"
            >
              Visualizar prévia
            </button>
            <button className="button" disabled={pending} type="submit">
              Criar escala
            </button>
          </div>
        </form>
        {preview.length > 0 && (
          <div className="schedule-preview" aria-label="Prévia da escala">
            {preview.map((day) => (
              <div
                className={statusClass(day.status === "UNKNOWN" ? "UNKNOWN" : day.status)}
                key={day.date}
              >
                <span>{day.date.slice(5)}</span>
                <strong>{availabilityStatusLabels[day.status]}</strong>
                {holidays.some((holiday) => holiday.date === day.date) && (
                  <small>
                    {holidays
                      .filter((holiday) => holiday.date === day.date)
                      .map((holiday) => holiday.name)
                      .join(" · ")}
                  </small>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Minhas escalas</h2>
            <p className="muted small">A escala ativa mais recentemente alterada tem prioridade.</p>
          </div>
          <span>{schedules.length}</span>
        </div>
        {schedules.length ? (
          <div className="schedule-list">
            {schedules.map((rule) => (
              <article className="schedule-row" key={rule.id}>
                <div>
                  <span
                    className={`status-dot ${rule.status === "ACTIVE" ? "active" : "inactive"}`}
                  >
                    {rule.status === "ACTIVE" ? "Ativa" : "Pausada"}
                  </span>
                  <h3>{rule.name}</h3>
                  <p className="muted small">
                    {rule.ruleType === "CYCLE"
                      ? `${rule.workDays}×${rule.restDays} desde ${rule.anchorDate?.slice(0, 10)}`
                      : "Padrão semanal"}
                  </p>
                </div>
                <div className="member-actions">
                  <button
                    className="button ghost"
                    disabled={pending}
                    onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
                    type="button"
                  >
                    {editingId === rule.id ? "Cancelar" : "Editar"}
                  </button>
                  <button
                    className="button ghost"
                    disabled={pending}
                    onClick={() => changeStatus(rule)}
                    type="button"
                  >
                    {rule.status === "ACTIVE" ? "Pausar" : "Ativar"}
                  </button>
                  <button
                    className="button danger-outline"
                    disabled={pending}
                    onClick={() => remove(rule.id)}
                    type="button"
                  >
                    Remover
                  </button>
                </div>
                {editingId === rule.id && (
                  <form className="form inline-edit-form" onSubmit={(event) => update(event, rule)}>
                    <div className="field">
                      <label htmlFor={`edit-schedule-name-${rule.id}`}>Nome da escala</label>
                      <input
                        defaultValue={rule.name}
                        id={`edit-schedule-name-${rule.id}`}
                        name="name"
                        required
                      />
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor={`edit-schedule-start-${rule.id}`}>Data inicial</label>
                        <input
                          defaultValue={rule.startDate}
                          id={`edit-schedule-start-${rule.id}`}
                          name="startDate"
                          required
                          type="date"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`edit-schedule-end-${rule.id}`}>Data final opcional</label>
                        <input
                          defaultValue={rule.endDate ?? ""}
                          id={`edit-schedule-end-${rule.id}`}
                          name="endDate"
                          type="date"
                        />
                      </div>
                    </div>
                    {rule.ruleType === "CYCLE" ? (
                      <div className="form-row cycle-fields">
                        <div className="field">
                          <label htmlFor={`edit-schedule-anchor-${rule.id}`}>Início do ciclo</label>
                          <input
                            defaultValue={rule.anchorDate ?? rule.startDate}
                            id={`edit-schedule-anchor-${rule.id}`}
                            name="anchorDate"
                            required
                            type="date"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-schedule-work-${rule.id}`}>Dias trabalhando</label>
                          <input
                            defaultValue={rule.workDays ?? 1}
                            id={`edit-schedule-work-${rule.id}`}
                            max={30}
                            min={1}
                            name="workDays"
                            required
                            type="number"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`edit-schedule-rest-${rule.id}`}>Dias de folga</label>
                          <input
                            defaultValue={rule.restDays ?? 1}
                            id={`edit-schedule-rest-${rule.id}`}
                            max={30}
                            min={1}
                            name="restDays"
                            required
                            type="number"
                          />
                        </div>
                      </div>
                    ) : (
                      <fieldset className="weekday-picker">
                        <legend>Dias de trabalho</legend>
                        {weekdays.map(([day, label]) => (
                          <label key={day}>
                            <input
                              defaultChecked={rule.weeklyPattern?.[day] === "WORKING"}
                              name={day}
                              type="checkbox"
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
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
            <span className="empty-icon">🔁</span>
            <p>Você ainda não configurou uma escala.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
