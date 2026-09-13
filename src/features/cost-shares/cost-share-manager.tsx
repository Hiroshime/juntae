"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";

type Participant = { id: string; name: string; avatarUrl: string | null };
type Expense = {
  id: string;
  payerId: string;
  payerName: string;
  description: string;
  amountCents: number;
  purchasedAt: string;
  canEdit: boolean;
};
type Balance = Participant & { paidCents: number; shareCents: number; balanceCents: number };
type Transfer = {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amountCents: number;
};

export function CostShareManager({
  communityId,
  currentUserId,
  today,
  allMembers,
  costShare,
  hasEventAccount = false,
}: {
  hasEventAccount?: boolean;
  communityId: string;
  currentUserId: string;
  today: string;
  allMembers: Participant[];
  costShare: {
    id: string;
    title: string;
    description: string | null;
    currency: string;
    status: "OPEN" | "CLOSED";
    canManage: boolean;
    currentUserIsParticipant: boolean;
    participants: Participant[];
    expenses: Expense[];
    calculation: {
      totalCents: number;
      averagePerPersonCents: number;
      balances: Balance[];
      transfers: Transfer[];
    };
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState(
    costShare.participants.map((item) => item.id),
  );
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const open = costShare.status === "OPEN";
  const payerOptions = costShare.canManage
    ? costShare.participants
    : costShare.participants.filter((participant) => participant.id === currentUserId);

  function money(cents: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: costShare.currency,
    }).format(cents / 100);
  }

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a operação.");
  }

  function expenseBody(form: FormData) {
    return {
      description: String(form.get("description")),
      amount: Number(form.get("amount")),
      payerId: String(form.get("payerId")),
      purchasedAt: String(form.get("purchasedAt")),
    };
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage(null);
    try {
      await request(
        `/api/communities/${communityId}/cost-shares/${costShare.id}/expenses`,
        "POST",
        expenseBody(new FormData(formElement)),
      );
      formElement.reset();
      setMessage({ kind: "success", text: "Compra adicionada e rateio recalculado." });
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

  async function updateExpense(event: FormEvent<HTMLFormElement>, expenseId: string) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await request(
        `/api/communities/${communityId}/cost-shares/${costShare.id}/expenses/${expenseId}`,
        "PATCH",
        expenseBody(new FormData(event.currentTarget)),
      );
      setEditingExpenseId(null);
      setMessage({ kind: "success", text: "Compra atualizada." });
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

  async function removeExpense(expenseId: string) {
    if (!window.confirm("Remover esta compra do rateio?")) return;
    setPending(true);
    setMessage(null);
    try {
      await request(
        `/api/communities/${communityId}/cost-shares/${costShare.id}/expenses/${expenseId}`,
        "DELETE",
      );
      setMessage({ kind: "success", text: "Compra removida e rateio recalculado." });
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

  async function updateParticipants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    try {
      await request(`/api/communities/${communityId}/cost-shares/${costShare.id}`, "PATCH", {
        title: String(form.get("title")),
        description: String(form.get("description") ?? ""),
        participantIds,
      });
      setMessage({ kind: "success", text: "Rateio atualizado e valores recalculados." });
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

  async function changeStatus() {
    setPending(true);
    setMessage(null);
    const nextStatus = open ? "CLOSED" : "OPEN";
    try {
      await request(`/api/communities/${communityId}/cost-shares/${costShare.id}/status`, "PATCH", {
        status: nextStatus,
      });
      setMessage({
        kind: "success",
        text: nextStatus === "CLOSED" ? "Rateio fechado." : "Rateio reaberto.",
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

  return (
    <div className="cost-share-detail">
      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
      <section className="cost-share-metrics">
        <div className="card">
          <span>Total comprado</span>
          <strong>{money(costShare.calculation.totalCents)}</strong>
        </div>
        <div className="card">
          <span>Média por pessoa</span>
          <strong>{money(costShare.calculation.averagePerPersonCents)}</strong>
        </div>
        <div className="card">
          <span>Participantes</span>
          <strong>{costShare.participants.length}</strong>
        </div>
      </section>

      <div className="grid cost-share-detail-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Acerto final</div>
              <h2>Quem paga quem</h2>
            </div>
            <span>⇄</span>
          </div>
          {hasEventAccount ? (
            <p className="muted">
              O acerto deste rateio está centralizado na conta do evento. Abra o evento pelo link
              acima para consultar o saldo total e os pagamentos. As compras já pagas são
              descontadas lá, junto com os demais rateios e o custo do evento.
            </p>
          ) : costShare.calculation.transfers.length ? (
            <div className="settlement-list">
              {costShare.calculation.transfers.map((transfer) => (
                <div className="settlement-row" key={`${transfer.fromUserId}-${transfer.toUserId}`}>
                  <strong>{transfer.fromName}</strong>
                  <span>paga</span>
                  <strong>{money(transfer.amountCents)}</strong>
                  <span>para</span>
                  <strong>{transfer.toName}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <p>
                {costShare.calculation.totalCents
                  ? "Tudo acertado: ninguém deve nada."
                  : "Adicione compras para calcular o acerto."}
              </p>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Saldos</div>
              <h2>Resumo por pessoa</h2>
            </div>
          </div>
          <div className="balance-list">
            {costShare.calculation.balances.map((balance) => (
              <div className="balance-row" key={balance.id}>
                <Avatar name={balance.name} url={balance.avatarUrl} size="small" />
                <div>
                  <strong>{balance.name}</strong>
                  <span>
                    Pagou {money(balance.paidCents)} · Cota {money(balance.shareCents)}
                  </span>
                </div>
                <strong
                  className={balance.balanceCents >= 0 ? "balance-positive" : "balance-negative"}
                >
                  {balance.balanceCents >= 0 ? "recebe " : "paga "}
                  {money(Math.abs(balance.balanceCents))}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      {open && (costShare.canManage || costShare.currentUserIsParticipant) && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Nova compra</div>
              <h2>Adicionar item</h2>
            </div>
            <span>＋</span>
          </div>
          <form className="form cost-share-expense-form" onSubmit={addExpense}>
            <div className="field">
              <label htmlFor="expense-description">Item</label>
              <input
                id="expense-description"
                name="description"
                maxLength={200}
                placeholder="Carnes para o churrasco"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="expense-amount">Valor</label>
              <input
                id="expense-amount"
                name="amount"
                min="0.01"
                step="0.01"
                type="number"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="expense-payer">Quem pagou</label>
              <select id="expense-payer" name="payerId" defaultValue={payerOptions[0]?.id} required>
                {payerOptions.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="expense-date">Data</label>
              <input
                id="expense-date"
                name="purchasedAt"
                defaultValue={today}
                type="date"
                required
              />
            </div>
            <button className="button" disabled={pending || !payerOptions.length} type="submit">
              Adicionar compra
            </button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div>
            <div className="eyebrow">Compras</div>
            <h2>Itens do rateio</h2>
          </div>
          <span>{costShare.expenses.length}</span>
        </div>
        {costShare.expenses.length ? (
          <div className="expense-list">
            {costShare.expenses.map((expense) => (
              <article className="expense-row" key={expense.id}>
                <div>
                  <strong>{expense.description}</strong>
                  <span>
                    {expense.payerName} pagou em {expense.purchasedAt}
                  </span>
                </div>
                <strong>{money(expense.amountCents)}</strong>
                {open && expense.canEdit && (
                  <div className="member-actions">
                    <button
                      className="button ghost"
                      disabled={pending}
                      onClick={() =>
                        setEditingExpenseId(editingExpenseId === expense.id ? null : expense.id)
                      }
                      type="button"
                    >
                      {editingExpenseId === expense.id ? "Cancelar" : "Editar"}
                    </button>
                    <button
                      className="button danger-outline"
                      disabled={pending}
                      onClick={() => removeExpense(expense.id)}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                )}
                {editingExpenseId === expense.id && (
                  <form
                    className="form inline-edit-form expense-edit-form"
                    onSubmit={(event) => updateExpense(event, expense.id)}
                  >
                    <div className="field">
                      <label htmlFor={`edit-expense-description-${expense.id}`}>Item</label>
                      <input
                        id={`edit-expense-description-${expense.id}`}
                        name="description"
                        defaultValue={expense.description}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-expense-amount-${expense.id}`}>Valor</label>
                      <input
                        id={`edit-expense-amount-${expense.id}`}
                        name="amount"
                        defaultValue={(expense.amountCents / 100).toFixed(2)}
                        min="0.01"
                        step="0.01"
                        type="number"
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-expense-payer-${expense.id}`}>Pagador</label>
                      <select
                        id={`edit-expense-payer-${expense.id}`}
                        name="payerId"
                        defaultValue={expense.payerId}
                      >
                        {(costShare.canManage
                          ? costShare.participants
                          : costShare.participants.filter(
                              (participant) => participant.id === expense.payerId,
                            )
                        ).map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`edit-expense-date-${expense.id}`}>Data</label>
                      <input
                        id={`edit-expense-date-${expense.id}`}
                        name="purchasedAt"
                        defaultValue={expense.purchasedAt}
                        type="date"
                        required
                      />
                    </div>
                    <button className="button" disabled={pending} type="submit">
                      Salvar compra
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <p>Nenhuma compra adicionada.</p>
          </div>
        )}
      </section>

      {costShare.canManage && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Administração</div>
              <h2>Configurar rateio</h2>
            </div>
            <button
              className="button secondary"
              disabled={pending}
              onClick={changeStatus}
              type="button"
            >
              {open ? "Fechar rateio" : "Reabrir rateio"}
            </button>
          </div>
          {open && (
            <form className="form" onSubmit={updateParticipants}>
              <div className="field">
                <label htmlFor="edit-cost-share-title">Título</label>
                <input
                  id="edit-cost-share-title"
                  name="title"
                  defaultValue={costShare.title}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-cost-share-description">Descrição</label>
                <textarea
                  id="edit-cost-share-description"
                  name="description"
                  defaultValue={costShare.description ?? ""}
                  rows={2}
                />
              </div>
              <fieldset className="member-filter cost-share-member-picker">
                <legend>Participantes ({participantIds.length})</legend>
                <div>
                  {allMembers.map((member) => (
                    <label key={member.id}>
                      <input
                        checked={participantIds.includes(member.id)}
                        onChange={() =>
                          setParticipantIds((current) =>
                            current.includes(member.id)
                              ? current.filter((id) => id !== member.id)
                              : [...current, member.id],
                          )
                        }
                        type="checkbox"
                      />
                      <span>{member.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="button" disabled={pending} type="submit">
                Salvar participantes
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
