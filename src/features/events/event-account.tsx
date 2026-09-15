"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { EventAccountView } from "@/server/services/event-account-service";
import type { EventAccountAction } from "@/lib/validation/event-account";

type PaymentDirection = "RECEIVED" | "REFUNDED";
type EditingPayment = { userId: string; direction: PaymentDirection };

export function EventAccount({
  account,
  communityId,
  communitySlug,
  eventId,
}: {
  account: EventAccountView;
  communityId: string;
  communitySlug: string;
  eventId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<EditingPayment | null>(null);
  const summary = account.summary;
  const money = (cents: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: summary?.currency ?? "BRL",
    }).format(cents / 100);

  function act(action: EventAccountAction, success: string) {
    startTransition(async () => {
      setMessage(null);
      try {
        const response = await fetch(`/api/communities/${communityId}/events/${eventId}/account`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar.");
        setEditing(null);
        setMessage({ error: false, text: success });
        router.refresh();
      } catch (error) {
        setMessage({
          error: true,
          text: error instanceof Error ? error.message : "Falha na conexão. Tente novamente.",
        });
        router.refresh();
      }
    });
  }

  function payment(
    event: FormEvent<HTMLFormElement>,
    person: NonNullable<typeof summary>["people"][number],
    direction: PaymentDirection,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
    ) {
      setMessage({ error: true, text: "Informe um valor positivo com até duas casas decimais." });
      return;
    }
    act(
      {
        action: "PAYMENT",
        userId: person.id,
        direction,
        amountCents: Math.round(amount * 100),
        note: String(data.get("note") ?? ""),
        revision: account.revision,
      },
      "Pagamento registrado e saldo atualizado.",
    );
  }

  if (!account.enabled && !account.canManage) return null;
  return (
    <section className="card event-account" id="conta" aria-labelledby="event-account-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Acerto do passeio</div>
          <h2 id="event-account-title">Conta do evento</h2>
        </div>
        <span
          className={`status-dot ${account.enabled && !account.closedAt ? "active" : "inactive"}`}
        >
          {!account.enabled ? "Desabilitada" : account.closedAt ? "Fechada" : "Aberta"}
        </span>
      </div>
      {!account.enabled ? (
        <>
          <p className="muted">
            Habilite para somar o custo do evento e os rateios vinculados, descontar compras já
            pagas e acompanhar quem quitou ou ainda tem saldo.
          </p>
          <button
            className="button"
            disabled={pending}
            onClick={() => act({ action: "ENABLE" }, "Controle de pagamentos habilitado.")}
            type="button"
          >
            Habilitar controle de pagamentos
          </button>
        </>
      ) : (
        <>
          <p className="muted small">
            Acerto centralizado com a organização do evento. O custo do evento é dividido igualmente
            entre os confirmados, mesmo com presença parcial. Cada rateio usa sua própria lista de
            participantes. Compras já pagas são descontadas da cota.
          </p>
          <p className="muted small">
            Informe no custo do evento apenas o valor base (como a locação), sem repetir despesas
            dos rateios. Registre aqui somente pagamentos já realizados e aportes da organização;
            você pode registrar várias parcelas, inclusive antes de existir uma dívida. Esta
            ferramenta não movimenta dinheiro. Não quite novamente as transferências sugeridas em
            cada rateio.
          </p>
          {account.closedAt ? (
            <p className="success">
              Conta fechada em {new Date(account.closedAt).toLocaleDateString("pt-BR")}. Os valores
              abaixo foram preservados no fechamento. Novas alterações no evento ou nos rateios só
              entram na conta ao reabri-la.
            </p>
          ) : (
            <p className="muted small">
              Conta aberta: mudanças no custo, confirmações ou compras recalculam os saldos.
              Pagamentos registrados são preservados.
            </p>
          )}
          {account.issues.length > 0 && (
            <div className="error" role="alert">
              {account.issues.join(" ")} Os totais estão incompletos; corrija antes de registrar
              pagamentos ou fechar a conta.
            </div>
          )}
          {summary && (
            <>
              <div className="account-totals">
                <div>
                  <span>Custo do evento</span>
                  <strong>{money(summary.eventCostCents)}</strong>
                  <small>{summary.confirmedCount} confirmados</small>
                </div>
                <div>
                  <span>Rateios vinculados</span>
                  <strong>{money(summary.sharesTotalCents)}</strong>
                </div>
                <div>
                  <span>Total do passeio</span>
                  <strong>{money(summary.totalCents)}</strong>
                </div>
                <div>
                  <span>A receber</span>
                  <strong>{money(summary.pendingCents)}</strong>
                  <small>A reembolsar: {money(summary.refundableCents)}</small>
                </div>
              </div>
              {summary.shares.length > 0 && (
                <details>
                  <summary>Ver composição dos rateios</summary>
                  <ul>
                    {summary.shares.map((share) => (
                      <li key={share.id}>
                        <Link href={`/app/${communitySlug}/cost-shares/${share.id}`}>
                          {share.title}
                        </Link>{" "}
                        · {money(share.totalCents)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="account-people">
                {summary.people.map((person) => (
                  <article
                    className="account-person"
                    key={person.id}
                    aria-label={`Conta de ${person.name}`}
                  >
                    <div className="card-header">
                      <h3>{person.name}</h3>
                      <span
                        className={`availability-badge ${person.dueCents === 0 ? "availability-available" : person.dueCents > 0 ? "availability-partially-available" : "availability-working"}`}
                      >
                        {person.dueCents === 0
                          ? "Quitado"
                          : person.dueCents > 0
                            ? "Pendente"
                            : "A reembolsar"}
                      </span>
                    </div>
                    <dl className="account-breakdown">
                      <div>
                        <dt>Evento</dt>
                        <dd>{money(person.eventShareCents)}</dd>
                      </div>
                      <div>
                        <dt>Rateios</dt>
                        <dd>{money(person.costSharesCents)}</dd>
                      </div>
                      <div>
                        <dt>Cota total</dt>
                        <dd>{money(person.eventShareCents + person.costSharesCents)}</dd>
                      </div>
                      <div>
                        <dt>Compras já pagas</dt>
                        <dd>{money(person.purchasesCents)}</dd>
                      </div>
                      <div>
                        <dt>Pagamentos recebidos</dt>
                        <dd>{money(person.receivedCents)}</dd>
                      </div>
                      {person.refundedCents > 0 && (
                        <div>
                          <dt>Reembolsos feitos</dt>
                          <dd>{money(person.refundedCents)}</dd>
                        </div>
                      )}
                      <div className="account-due">
                        <dt>
                          {person.dueCents < 0
                            ? "Crédito a favor"
                            : person.dueCents > 0
                              ? "Falta pagar"
                              : "Saldo zerado"}
                        </dt>
                        <dd>{money(Math.abs(person.dueCents))}</dd>
                      </div>
                    </dl>
                    {account.canManage &&
                      !account.closedAt &&
                      !account.issues.length &&
                      (editing?.userId === person.id ? (
                        <form
                          className="form"
                          onSubmit={(event) =>
                            payment(event, person, editing?.direction ?? "RECEIVED")
                          }
                        >
                          <div className="field">
                            <label htmlFor={`payment-${person.id}`}>
                              Valor {editing?.direction === "REFUNDED" ? "reembolsado" : "recebido"}
                            </label>
                            <input
                              id={`payment-${person.id}`}
                              name="amount"
                              type="number"
                              min="0.01"
                              max={
                                editing?.direction === "REFUNDED" && person.dueCents < 0
                                  ? (Math.abs(person.dueCents) / 100).toFixed(2)
                                  : undefined
                              }
                              step="0.01"
                              defaultValue={
                                editing?.direction === "REFUNDED" || person.dueCents > 0
                                  ? (Math.abs(person.dueCents) / 100).toFixed(2)
                                  : undefined
                              }
                              placeholder="Ex.: 40,00"
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`payment-note-${person.id}`}>
                              Observação (opcional)
                            </label>
                            <input
                              id={`payment-note-${person.id}`}
                              name="note"
                              maxLength={500}
                              placeholder="Ex.: Parcela de setembro ou Pix recebido"
                            />
                          </div>
                          <div className="actions compact-actions">
                            <button className="button" disabled={pending} type="submit">
                              Confirmar registro
                            </button>
                            <button
                              className="button ghost"
                              disabled={pending}
                              onClick={() => setEditing(null)}
                              type="button"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="actions compact-actions">
                          <button
                            className="button secondary"
                            disabled={pending}
                            onClick={() => setEditing({ userId: person.id, direction: "RECEIVED" })}
                            type="button"
                          >
                            Registrar pagamento
                          </button>
                          {person.dueCents < 0 && (
                            <button
                              className="button ghost"
                              disabled={pending}
                              onClick={() =>
                                setEditing({ userId: person.id, direction: "REFUNDED" })
                              }
                              type="button"
                            >
                              Registrar reembolso
                            </button>
                          )}
                        </div>
                      ))}
                  </article>
                ))}
              </div>
              {!summary.people.length && (
                <p className="muted">
                  Aguardando participantes confirmados ou participantes nos rateios.
                </p>
              )}
            </>
          )}
          {account.payments.length > 0 && (
            <details className="account-history">
              <summary>Histórico de pagamentos ({account.payments.length})</summary>
              <ul>
                {account.payments.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <strong>{entry.name}</strong> ·{" "}
                      {entry.direction === "RECEIVED" ? "Recebido" : "Reembolsado"}:{" "}
                      {money(entry.amountCents)}
                      {entry.voidedAt ? " · Anulado" : ""}
                      <br />
                      <small>
                        Registrado por {entry.recordedBy} em{" "}
                        {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
                        {entry.note ? ` · ${entry.note}` : ""}
                        {entry.voidedBy ? ` · Anulado por ${entry.voidedBy}` : ""}
                      </small>
                    </span>
                    {account.canManage && !account.closedAt && !entry.voidedAt && (
                      <button
                        className="button ghost"
                        disabled={pending}
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Anular este registro? O saldo será recalculado e o histórico será preservado.",
                            )
                          )
                            act({ action: "VOID", paymentId: entry.id }, "Registro anulado.");
                        }}
                      >
                        Anular registro
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {account.canManage && (
            <div className="actions compact-actions">
              {account.closedAt ? (
                <button
                  className="button secondary"
                  disabled={pending}
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Reabrir e recalcular a conta com os custos, rateios e participantes atuais? Pagamentos serão preservados.",
                      )
                    )
                      act({ action: "REOPEN" }, "Conta reaberta e recalculada.");
                  }}
                >
                  Reabrir conta
                </button>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={
                      pending ||
                      !!account.issues.length ||
                      !summary?.people.length ||
                      !!summary.pendingCents ||
                      !!summary.refundableCents
                    }
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Fechar a conta e preservar estes valores como acerto final?",
                        )
                      )
                        act(
                          { action: "CLOSE", revision: account.revision },
                          "Conta do evento fechada.",
                        );
                    }}
                  >
                    Fechar conta do evento
                  </button>
                  {!account.payments.length && (
                    <button
                      className="button ghost"
                      disabled={pending}
                      type="button"
                      onClick={() =>
                        act({ action: "DISABLE" }, "Controle de pagamentos desabilitado.")
                      }
                    >
                      Desabilitar controle
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      {message && (
        <div
          className={message.error ? "error" : "success"}
          role={message.error ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}
    </section>
  );
}
