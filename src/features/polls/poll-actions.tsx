"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PollType } from "@prisma/client";
import { zonedDateTimeToUtc } from "@/lib/dates/civil-date";
import {
  PollOptionContent,
  PollOptionLinks,
  type RichPollOption,
} from "@/features/polls/poll-option-card";

type VoteOption = RichPollOption & {
  id: string;
  label: string;
  dateValue: string | null;
  availability: {
    fullAvailableCount: number;
    unknownCount: number;
    score: number;
    totalMembers: number;
  } | null;
};

export function PollVoteForm({
  communityId,
  pollId,
  type,
  options,
  initialOptionIds,
  canVote,
  allowVoteChange,
  isOpen,
}: {
  communityId: string;
  pollId: string;
  type: PollType;
  options: VoteOption[];
  initialOptionIds: string[];
  canVote: boolean;
  allowVoteChange: boolean;
  isOpen: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(initialOptionIds));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const isSingle = type === "SINGLE_CHOICE";

  function select(optionId: string) {
    setSelected((current) => {
      if (isSingle) return new Set([optionId]);
      const next = new Set(current);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/communities/${communityId}/polls/${pollId}/vote`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionIds: [...selected] }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: result.error ?? "Não foi possível registrar o voto." });
      return;
    }
    setMessage({
      kind: "success",
      text: initialOptionIds.length ? "Voto atualizado." : "Voto registrado.",
    });
    router.refresh();
  }

  async function remove() {
    setPending(true);
    setMessage(null);
    const response = await fetch(`/api/communities/${communityId}/polls/${pollId}/vote`, {
      method: "DELETE",
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: result.error ?? "Não foi possível remover o voto." });
      return;
    }
    setSelected(new Set());
    setMessage({ kind: "success", text: "Voto removido." });
    router.refresh();
  }

  return (
    <form className="card poll-vote-form" onSubmit={submit}>
      <div className="card-header">
        <div>
          <h2>Seu voto</h2>
          <p className="muted small">
            {isSingle ? "Escolha uma opção." : "Selecione todas as opções que você prefere."}
          </p>
        </div>
        <span>🗳️</span>
      </div>
      <fieldset>
        <legend className="sr-only">Opções da votação</legend>
        <div className="vote-options">
          {options.map((option) => (
            <article
              className={`vote-option ${selected.has(option.id) ? "selected" : ""}`}
              key={option.id}
            >
              <input
                aria-label={`Votar em ${option.label}`}
                id={`poll-vote-${option.id}`}
                checked={selected.has(option.id)}
                disabled={!canVote || pending}
                name="poll-vote"
                onChange={() => select(option.id)}
                type={isSingle ? "radio" : "checkbox"}
                value={option.id}
              />
              <div className="vote-option-body">
                <PollOptionContent option={option} />
                {option.availability && (
                  <small>
                    {option.availability.fullAvailableCount}/{option.availability.totalMembers}{" "}
                    disponíveis · {option.availability.unknownCount} sem informação · score{" "}
                    {option.availability.score}
                  </small>
                )}
                <PollOptionLinks option={option} />
              </div>
            </article>
          ))}
        </div>
      </fieldset>
      {isOpen && !canVote && initialOptionIds.length > 0 && !allowVoteChange && (
        <div className="poll-lock-note">Esta votação não permite alterar o voto já registrado.</div>
      )}
      {!isOpen && <div className="poll-lock-note">A votação está encerrada.</div>}
      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}
      {canVote && (
        <div className="actions compact-actions">
          <button className="button" disabled={pending || selected.size === 0} type="submit">
            {pending ? "Salvando…" : initialOptionIds.length ? "Atualizar voto" : "Registrar voto"}
          </button>
          {initialOptionIds.length > 0 && allowVoteChange && (
            <button className="button ghost" disabled={pending} onClick={remove} type="button">
              Remover voto
            </button>
          )}
        </div>
      )}
    </form>
  );
}

export function PollManagement({
  communityId,
  communitySlug,
  pollId,
}: {
  communityId: string;
  communitySlug: string;
  pollId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (!window.confirm("Encerrar esta votação? Novos votos deixarão de ser aceitos.")) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/communities/${communityId}/polls/${pollId}/close`, {
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "Não foi possível encerrar a votação.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="poll-management">
      <button
        className="button secondary"
        onClick={() => router.push(`/app/${communitySlug}/polls/${pollId}/edit`)}
        type="button"
      >
        Editar
      </button>
      <button className="button danger-outline" disabled={pending} onClick={close} type="button">
        Encerrar votação
      </button>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function localDateTimeToUtc(value: string, timezone: string) {
  const [date, time] = value.split("T");
  return zonedDateTimeToUtc(date, time, timezone).toISOString();
}

export function PollSettingsForm({
  communityId,
  communitySlug,
  pollId,
  timezone,
  initial,
}: {
  communityId: string;
  communitySlug: string;
  pollId: string;
  timezone: string;
  initial: {
    title: string;
    description: string;
    allowVoteChange: boolean;
    closesAt: string;
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const closesAt = String(form.get("closesAt") || "");
    const response = await fetch(`/api/communities/${communityId}/polls/${pollId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title")),
        description: String(form.get("description") || ""),
        allowVoteChange: form.get("allowVoteChange") === "on",
        closesAt: closesAt ? localDateTimeToUtc(closesAt, timezone) : null,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(result.error ?? "Não foi possível salvar a votação.");
      return;
    }
    router.push(`/app/${communitySlug}/polls/${pollId}`);
    router.refresh();
  }

  return (
    <form className="card form poll-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="poll-title">Título</label>
        <input id="poll-title" name="title" defaultValue={initial.title} maxLength={160} required />
      </div>
      <div className="field">
        <label htmlFor="poll-description">Descrição</label>
        <textarea
          id="poll-description"
          name="description"
          defaultValue={initial.description}
          rows={4}
        />
      </div>
      <div className="field">
        <label htmlFor="poll-closes">Prazo para votar (opcional)</label>
        <input
          id="poll-closes"
          name="closesAt"
          defaultValue={initial.closesAt}
          type="datetime-local"
        />
        <span className="field-help">Horário interpretado em {timezone}.</span>
      </div>
      <label className="toggle-row">
        <input defaultChecked={initial.allowVoteChange} name="allowVoteChange" type="checkbox" />
        Permitir que membros alterem o voto
      </label>
      <p className="field-help">As opções ficam fixas após a publicação para preservar os votos.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="actions compact-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <button className="button ghost" onClick={() => router.back()} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
