"use client";

import { useState, type FormEvent } from "react";
import { allocateByPeriods, billingDates } from "@/server/domain/event-billing";
import type { EventAccountSummary } from "@/server/domain/event-account";
import type { EventAccountView } from "@/server/services/event-account-service";
import type { EventAccountAction } from "@/lib/validation/event-account";

export function EventBillingManager({
  billing,
  canManage,
  closed,
  snapshot,
  revision,
  pending,
  onSave,
}: {
  billing: EventAccountView["billing"];
  canManage: boolean;
  closed: boolean;
  snapshot: EventAccountSummary | null;
  revision: string;
  pending: boolean;
  onSave: (action: EventAccountAction, message: string) => void;
}) {
  const [mode, setMode] = useState(billing.mode);
  const [periods, setPeriods] = useState(() =>
    billing.periods
      .filter((period) => period.date)
      .map((period) => ({
        date: period.date,
        userIds: period.participants.map((person) => person.id),
      })),
  );
  const [error, setError] = useState("");
  const money = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: closed && snapshot ? snapshot.currency : billing.currency,
    }).format(value / 100);
  function chooseMode(value: typeof mode) {
    setMode(value);
    setError("");
    if (value === "EQUAL") {
      setPeriods([]);
      return;
    }
    try {
      const dates = billingDates(
        {
          ...billing.eventDates,
          startsAt: new Date(billing.eventDates.startsAt),
          endsAt: billing.eventDates.endsAt ? new Date(billing.eventDates.endsAt) : null,
        },
        value,
      );
      if (!dates.length)
        setError("Para dividir por noites, o evento precisa incluir pelo menos uma pernoite.");
      setPeriods(
        dates.map((date) => ({
          date,
          userIds:
            value === "DAY"
              ? billing.days.find((day) => day.date === date)?.participantIds || []
              : billing.fullAttendanceIds,
        })),
      );
    } catch {
      setPeriods([]);
      setError("A divisão por períodos aceita até 366 dias. Confira as datas do evento.");
    }
  }
  const preview = allocateByPeriods(
    billing.amountCents,
    mode === "EQUAL"
      ? [{ date: "", label: "Evento inteiro", participants: billing.confirmed }]
      : periods.map((period) => ({
          date: period.date,
          label: `${mode === "NIGHT" ? "Noite de" : "Dia"} ${period.date}`,
          participants: billing.confirmed.filter((person) => period.userIds.includes(person.id)),
        })),
  );
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(
      { action: "CONFIGURE", mode, periods: mode === "EQUAL" ? [] : periods, revision },
      "Divisão do evento salva e valores recalculados.",
    );
  }
  const saved = closed ? snapshot?.periods || [] : billing.breakdown;
  return (
    <section className="card event-billing" id="divisao" aria-label="Divisão do custo do evento">
      <h2>Divisão do custo do evento</h2>
      <p className="muted">
        Total {money(closed && snapshot ? snapshot.eventCostCents : billing.amountCents)} ·{" "}
        {closed && snapshot
          ? snapshot.billingMode === "NIGHT"
            ? "Por noite"
            : snapshot.billingMode === "DAY"
              ? "Por dia"
              : "Igual entre confirmados"
          : billing.mode === "NIGHT"
            ? "Por noite"
            : billing.mode === "DAY"
              ? "Por dia"
              : "Igual entre confirmados"}
      </p>
      {closed ? (
        <p className="small muted">
          Divisão preservada no fechamento. Reabra a conta para alterar.
        </p>
      ) : (
        <>
          <p className="small muted">
            Cada período recebe uma parte do custo total; essa parte é dividida entre as pessoas
            incluídas nele. A presença serve de sugestão. Uma seleção manual salva só muda quando a
            organização a revisa.
          </p>
          {billing.issues.length > 0 && (
            <p className="error" role="alert">
              {billing.issues.join(" ")}
            </p>
          )}
        </>
      )}
      {saved.length > 0 && (
        <details>
          <summary>Ver valores por período</summary>
          <div className="billing-periods">
            {saved.map((period) => (
              <article className="billing-period" key={period.date}>
                <h3>
                  {period.label} · {money(period.amountCents)}
                </h3>
                {period.participants.length ? (
                  <ul>
                    {period.participants.map((person) => (
                      <li key={person.id}>
                        {person.name}: {money(person.shareCents)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Sem participantes incluídos.</p>
                )}
              </article>
            ))}
          </div>
        </details>
      )}
      {canManage && !closed && (
        <details className="billing-editor">
          <summary>Configurar divisão e participantes</summary>
          <form className="form" onSubmit={save}>
            <fieldset className="billing-fields" disabled={pending}>
              <div className="field">
                <label htmlFor="billing-mode">Como dividir o custo</label>
                <select
                  id="billing-mode"
                  value={mode}
                  onChange={(event) => chooseMode(event.target.value as typeof mode)}
                >
                  <option value="EQUAL">Igual entre confirmados</option>
                  <option value="DAY">Por dia</option>
                  <option value="NIGHT">Por noite</option>
                </select>
              </div>
              {mode === "NIGHT" && (
                <p className="field-help">
                  Cada noite vai da data indicada até o dia seguinte. Marque quem vai dormir naquela
                  noite; quem só passa o dia pode ficar desmarcado.
                </p>
              )}
              {mode !== "EQUAL" && (
                <p className="field-help">
                  A seleção usa apenas pessoas com resposta Vou. Confirmações novas não são
                  acrescentadas automaticamente a uma seleção manual já salva.
                </p>
              )}
              <div className="billing-periods">
                {periods.map((period, index) => (
                  <fieldset className="billing-period" key={period.date}>
                    <legend>
                      {mode === "NIGHT" ? "Noite de" : "Dia"} {period.date}
                    </legend>
                    <div>
                      {billing.confirmed.map((person) => (
                        <label key={person.id}>
                          <input
                            type="checkbox"
                            checked={period.userIds.includes(person.id)}
                            onChange={() =>
                              setPeriods((current) =>
                                current.map((entry, i) =>
                                  i === index
                                    ? {
                                        ...entry,
                                        userIds: entry.userIds.includes(person.id)
                                          ? entry.userIds.filter((id) => id !== person.id)
                                          : [...entry.userIds, person.id],
                                      }
                                    : entry,
                                ),
                              )
                            }
                          />
                          {person.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="billing-preview" aria-label="Prévia da divisão">
                <h3>Prévia antes de salvar</h3>
                {billing.confirmed.map((person) => (
                  <p key={person.id}>
                    {person.name}: <strong>{money(preview.charges.get(person.id) || 0)}</strong>
                  </p>
                ))}
                {preview.unallocatedCents > 0 && (
                  <p className="error">
                    {money(preview.unallocatedCents)} sem participantes. Você pode salvar a seleção
                    para revisar depois; os pagamentos ficam bloqueados enquanto houver pendências.
                  </p>
                )}
              </div>
              <button
                className="button"
                disabled={!!error || (mode !== "EQUAL" && !periods.length)}
                type="submit"
              >
                Salvar divisão
              </button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  );
}
