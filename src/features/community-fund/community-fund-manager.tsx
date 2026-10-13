"use client";

import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";

type FundEntry = {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  submittedBy: string;
  reviewedBy: string | null;
  event: { id: string; title: string } | null;
  type: "DEPOSIT" | "USAGE";
  status: "PENDING" | "APPROVED" | "REJECTED" | "VOIDED";
  amountCents: number;
  referenceMonth: string | null;
  effectiveDate: string;
  note: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  isMine: boolean;
};

type FundData = {
  canManage: boolean;
  currentMonth: string;
  totalCents: number;
  myBalanceCents: number;
  myPendingCents: number;
  settings: {
    monthlyContributionCents: number | null;
    pixKey: string | null;
    pixRecipientName: string | null;
    pixCopyPaste: string | null;
    hasQrCode: boolean;
    updatedAt: string | null;
  };
  members: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    balanceCents: number;
    monthDepositCents: number;
  }>;
  events: Array<{ id: string; title: string; startsAt: string }>;
  entries: FundEntry[];
};

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function amountCents(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-");
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

const statusLabel = {
  PENDING: "Aguardando confirmação",
  APPROVED: "Confirmado",
  REJECTED: "Recusado",
  VOIDED: "Anulado",
} as const;

async function responseMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function CommunityFundManager({
  communityId,
  initialData,
}: {
  communityId: string;
  initialData: FundData;
}) {
  const [data, setData] = useState(initialData);
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feedbackScope, setFeedbackScope] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  async function refresh() {
    const response = await fetch(`/api/communities/${communityId}/fund`, { cache: "no-store" });
    if (response.ok) setData((await response.json()) as FundData);
  }

  async function mutate(key: string, request: () => Promise<Response>, success: string) {
    setPending(key);
    setFeedbackScope(key);
    setError("");
    setMessage("");
    try {
      const response = await request();
      if (!response.ok)
        throw new Error(await responseMessage(response, "Não foi possível concluir a operação."));
      await refresh();
      setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
      return false;
    } finally {
      setPending("");
    }
  }

  async function submitDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const ok = await mutate(
      "deposit",
      () =>
        fetch(`/api/communities/${communityId}/fund/deposits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountCents: amountCents(fields.get("amount")),
            referenceMonth: fields.get("referenceMonth"),
            effectiveDate: fields.get("effectiveDate"),
            note: fields.get("note"),
          }),
        }),
      "Depósito enviado para confirmação.",
    );
    if (ok) form.reset();
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    await mutate(
      "settings",
      () =>
        fetch(`/api/communities/${communityId}/fund`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            monthlyContributionCents: fields.get("monthlyContribution")
              ? amountCents(fields.get("monthlyContribution"))
              : null,
            pixKey: fields.get("pixKey"),
            pixRecipientName: fields.get("pixRecipientName"),
            pixCopyPaste: fields.get("pixCopyPaste"),
          }),
        }),
      "Configuração do Fundão atualizada.",
    );
  }

  async function uploadQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const ok = await mutate(
      "qr",
      () => fetch(`/api/communities/${communityId}/fund/pix-qr`, { method: "PUT", body }),
      "QR Code atualizado.",
    );
    if (ok) form.reset();
  }

  async function useBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const ok = await mutate(
      "usage",
      () =>
        fetch(`/api/communities/${communityId}/fund/usages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: fields.get("userId"),
            eventId: fields.get("eventId"),
            amountCents: amountCents(fields.get("amount")),
            effectiveDate: fields.get("effectiveDate"),
            note: fields.get("note"),
          }),
        }),
      "Uso do saldo registrado.",
    );
    if (ok) form.reset();
  }

  async function act(entry: FundEntry, action: "APPROVE" | "REJECT" | "VOID" | "CANCEL") {
    let note: string | undefined;
    if (action === "REJECT" || action === "VOID") {
      note = window
        .prompt(action === "REJECT" ? "Motivo da recusa:" : "Motivo da anulação:")
        ?.trim();
      if (!note) return;
    }
    await mutate(
      `${action}-${entry.id}`,
      () =>
        fetch(`/api/communities/${communityId}/fund/entries/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        }),
      action === "APPROVE"
        ? "Depósito confirmado e saldo atualizado."
        : action === "REJECT"
          ? "Depósito recusado."
          : "Lançamento anulado.",
    );
  }

  async function copyPix(value: string) {
    setFeedbackScope("global");
    try {
      await navigator.clipboard.writeText(value);
      setMessage("PIX copiado.");
      setError("");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto abaixo.");
    }
  }

  const pendingDeposits = data.entries.filter((entry) => entry.status === "PENDING");

  return (
    <div className="community-fund">
      <section className="fund-summary-grid" aria-label="Resumo do Fundão">
        <article className="card fund-summary-card featured">
          <span>Saldo total do grupo</span>
          <strong>{money(data.totalCents)}</strong>
          <small>Somente depósitos confirmados, descontando usos.</small>
        </article>
        <article className="card fund-summary-card">
          <span>Meu saldo</span>
          <strong>{money(data.myBalanceCents)}</strong>
          <small>Crédito disponível para atividades futuras.</small>
        </article>
        <article className="card fund-summary-card">
          <span>Aguardando confirmação</span>
          <strong>{money(data.myPendingCents)}</strong>
          <small>Seus depósitos ainda não aprovados.</small>
        </article>
        <article className="card fund-summary-card">
          <span>Contribuição sugerida</span>
          <strong>
            {data.settings.monthlyContributionCents
              ? money(data.settings.monthlyContributionCents)
              : "Livre"}
          </strong>
          <small>{monthLabel(data.currentMonth)}</small>
        </article>
      </section>

      {message && feedbackScope !== "usage" && (
        <div className="success" role="status">
          {message}
        </div>
      )}
      {error && feedbackScope !== "usage" && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <div className="fund-main-grid">
        <section className="card fund-pix-card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Deposite por PIX</div>
              <h2>Conta do Fundão</h2>
            </div>
            <span aria-hidden="true">◇</span>
          </div>
          {data.settings.hasQrCode && (
            // eslint-disable-next-line @next/next/no-img-element -- protected authenticated media route.
            <img
              alt="QR Code PIX do Fundão"
              className="fund-pix-qr"
              src={`/api/communities/${communityId}/fund/pix-qr?v=${encodeURIComponent(data.settings.updatedAt ?? "1")}`}
            />
          )}
          {data.settings.pixRecipientName && (
            <p>
              <strong>Recebedor:</strong> {data.settings.pixRecipientName}
            </p>
          )}
          {data.settings.pixKey && (
            <div className="fund-copy-row">
              <code>{data.settings.pixKey}</code>
              <button
                className="button secondary"
                type="button"
                onClick={() => copyPix(data.settings.pixKey!)}
              >
                Copiar chave
              </button>
            </div>
          )}
          {data.settings.pixCopyPaste && (
            <div className="fund-copy-paste">
              <label htmlFor="fund-pix-code">PIX Copia e Cola</label>
              <textarea id="fund-pix-code" readOnly rows={3} value={data.settings.pixCopyPaste} />
              <button
                className="button secondary"
                type="button"
                onClick={() => copyPix(data.settings.pixCopyPaste!)}
              >
                Copiar código PIX
              </button>
            </div>
          )}
          {!data.settings.hasQrCode && !data.settings.pixKey && !data.settings.pixCopyPaste && (
            <div className="empty-state compact">
              <p>Os administradores ainda não configuraram o PIX.</p>
            </div>
          )}
          <p className="muted small">
            Após pagar no banco, registre o depósito ao lado. A confirmação não é automática.
          </p>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Meu aporte</div>
              <h2>Registrar depósito</h2>
            </div>
            <span aria-hidden="true">＋</span>
          </div>
          <form className="form" onSubmit={submitDeposit}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="fund-deposit-amount">Valor</label>
                <input
                  id="fund-deposit-amount"
                  name="amount"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="50,00"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="fund-reference-month">Mês de referência</label>
                <input
                  id="fund-reference-month"
                  name="referenceMonth"
                  type="month"
                  defaultValue={data.currentMonth}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="fund-payment-date">Data do pagamento</label>
              <input
                id="fund-payment-date"
                name="effectiveDate"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="fund-deposit-note">Observação (opcional)</label>
              <input
                id="fund-deposit-note"
                name="note"
                maxLength={500}
                placeholder="Ex.: PIX enviado pela conta conjunta"
              />
            </div>
            <button className="button" disabled={pending === "deposit"} type="submit">
              {pending === "deposit" ? "Enviando…" : "Enviar para confirmação"}
            </button>
          </form>
        </section>
      </div>

      {data.canManage && (
        <section className="card fund-admin-card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Administração</div>
              <h2>Depósitos pendentes</h2>
            </div>
            <span>{pendingDeposits.length}</span>
          </div>
          {pendingDeposits.length ? (
            <div className="fund-pending-list">
              {pendingDeposits.map((entry) => (
                <article key={entry.id} className="fund-pending-row">
                  <Avatar name={entry.userName} url={entry.avatarUrl} size="small" />
                  <div>
                    <strong>{entry.userName}</strong>
                    <span>
                      {money(entry.amountCents)} ·{" "}
                      {entry.referenceMonth ? monthLabel(entry.referenceMonth) : ""}
                    </span>
                    {entry.note && <small>{entry.note}</small>}
                  </div>
                  <div>
                    <button
                      className="button"
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => act(entry, "APPROVE")}
                    >
                      Confirmar
                    </button>
                    <button
                      className="button secondary"
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => act(entry, "REJECT")}
                    >
                      Recusar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Nenhum depósito aguardando confirmação.</p>
          )}
        </section>
      )}

      {data.canManage && (
        <div className="fund-admin-grid">
          <details className="card fund-settings-card">
            <summary>Configurar contribuição e PIX</summary>
            <form className="form" onSubmit={saveSettings}>
              <div className="field">
                <label htmlFor="fund-monthly">Contribuição mensal sugerida</label>
                <input
                  id="fund-monthly"
                  name="monthlyContribution"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={
                    data.settings.monthlyContributionCents
                      ? (data.settings.monthlyContributionCents / 100).toFixed(2)
                      : ""
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="field">
                <label htmlFor="fund-pix-recipient">Nome do recebedor</label>
                <input
                  id="fund-pix-recipient"
                  name="pixRecipientName"
                  maxLength={120}
                  defaultValue={data.settings.pixRecipientName ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="fund-pix-key">Chave PIX</label>
                <input
                  id="fund-pix-key"
                  name="pixKey"
                  maxLength={320}
                  defaultValue={data.settings.pixKey ?? ""}
                />
              </div>
              <div className="field">
                <label htmlFor="fund-pix-copy">PIX Copia e Cola</label>
                <textarea
                  id="fund-pix-copy"
                  name="pixCopyPaste"
                  maxLength={1000}
                  rows={3}
                  defaultValue={data.settings.pixCopyPaste ?? ""}
                />
              </div>
              <button className="button" disabled={pending === "settings"} type="submit">
                Salvar configuração
              </button>
            </form>
            <form className="form fund-qr-form" onSubmit={uploadQr}>
              <div className="field">
                <label htmlFor="fund-qr-upload">Imagem do QR Code</label>
                <input
                  id="fund-qr-upload"
                  name="qrCode"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  required
                />
                <p className="field-help">JPEG, PNG, WebP ou AVIF, até 2 MB.</p>
              </div>
              <div className="actions">
                <button className="button secondary" disabled={pending === "qr"} type="submit">
                  Enviar QR Code
                </button>
                {data.settings.hasQrCode && (
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      mutate(
                        "delete-qr",
                        () =>
                          fetch(`/api/communities/${communityId}/fund/pix-qr`, {
                            method: "DELETE",
                          }),
                        "QR Code removido.",
                      )
                    }
                  >
                    Remover QR
                  </button>
                )}
              </div>
            </form>
          </details>

          <details className="card fund-settings-card">
            <summary>Usar saldo em uma atividade</summary>
            <form className="form" onSubmit={useBalance}>
              <div className="field">
                <label htmlFor="fund-usage-person">Membro</label>
                <select id="fund-usage-person" name="userId" required>
                  <option value="">Selecione</option>
                  {data.members
                    .filter((member) => member.balanceCents > 0)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} · {money(member.balanceCents)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="fund-usage-event">Evento (opcional)</label>
                <select id="fund-usage-event" name="eventId">
                  <option value="">Outra atividade</option>
                  {data.events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  São listados apenas eventos com a conta aberta. O crédito aparecerá e abaterá o
                  valor pendente do membro no evento.
                </p>
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="fund-usage-amount">Valor utilizado</label>
                  <input
                    id="fund-usage-amount"
                    name="amount"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    inputMode="decimal"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="fund-usage-date">Data</label>
                  <input
                    id="fund-usage-date"
                    name="effectiveDate"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fund-usage-note">Finalidade</label>
                <input
                  id="fund-usage-note"
                  name="note"
                  minLength={2}
                  maxLength={500}
                  placeholder="Ex.: Entrada da chácara"
                  required
                />
              </div>
              {feedbackScope === "usage" && message && (
                <div className="success" role="status">
                  {message}
                </div>
              )}
              {feedbackScope === "usage" && error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="button" disabled={pending === "usage"} type="submit">
                Registrar uso do saldo
              </button>
            </form>
          </details>
        </div>
      )}

      {data.canManage && (
        <section className="card">
          <div className="card-header">
            <div>
              <div className="eyebrow">Visão administrativa</div>
              <h2>Saldos dos membros</h2>
            </div>
          </div>
          <div className="fund-member-grid">
            {data.members.map((member) => (
              <article key={member.id} className="fund-member-card">
                <Avatar name={member.name} url={member.avatarUrl} size="small" />
                <div>
                  <strong>{member.name}</strong>
                  <span>Saldo {money(member.balanceCents)}</span>
                  <small>
                    {monthLabel(data.currentMonth)}: {money(member.monthDepositCents)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="card fund-history">
        <div className="card-header">
          <div>
            <div className="eyebrow">Auditoria</div>
            <h2>{data.canManage ? "Histórico do Fundão" : "Meu histórico"}</h2>
          </div>
          <span>Últimos {data.entries.length}</span>
        </div>
        {data.entries.length ? (
          <div className="fund-entry-list">
            {data.entries.map((entry) => (
              <article className="fund-entry-row" key={entry.id}>
                <div className={`fund-entry-icon ${entry.type.toLowerCase()}`} aria-hidden="true">
                  {entry.type === "DEPOSIT" ? "+" : "−"}
                </div>
                <div>
                  <div>
                    <strong>{entry.userName}</strong>
                    <span className={`status-dot fund-status-${entry.status.toLowerCase()}`}>
                      {statusLabel[entry.status]}
                    </span>
                  </div>
                  <p>
                    {entry.type === "DEPOSIT"
                      ? `Depósito de ${entry.referenceMonth ? monthLabel(entry.referenceMonth) : ""}`
                      : entry.note}
                    {entry.event ? ` · ${entry.event.title}` : ""}
                  </p>
                  <small>
                    {new Date(`${entry.effectiveDate}T12:00:00`).toLocaleDateString("pt-BR")} ·
                    registrado por {entry.submittedBy}
                    {entry.reviewedBy ? ` · revisado por ${entry.reviewedBy}` : ""}
                  </small>
                  {entry.type === "DEPOSIT" && entry.note && <small>{entry.note}</small>}
                  {entry.reviewNote && <small>Motivo: {entry.reviewNote}</small>}
                </div>
                <strong
                  className={entry.type === "DEPOSIT" ? "balance-positive" : "balance-negative"}
                >
                  {entry.type === "DEPOSIT" ? "+" : "−"}
                  {money(entry.amountCents)}
                </strong>
                <div className="fund-entry-actions">
                  {entry.status === "PENDING" && entry.isMine && (
                    <button
                      className="button ghost"
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => act(entry, "CANCEL")}
                    >
                      Cancelar
                    </button>
                  )}
                  {data.canManage && entry.status === "APPROVED" && (
                    <button
                      className="button ghost"
                      disabled={Boolean(pending)}
                      type="button"
                      onClick={() => act(entry, "VOID")}
                    >
                      Anular
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <p>Nenhum lançamento registrado.</p>
          </div>
        )}
      </section>
    </div>
  );
}
