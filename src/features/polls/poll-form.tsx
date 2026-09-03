"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { PollType } from "@prisma/client";
import { zonedDateTimeToUtc } from "@/lib/dates/civil-date";

type SuggestedDate = {
  date: string;
  fullAvailableCount: number;
  unknownCount: number;
  score: number;
  totalMembers: number;
};

function localDateTimeToUtc(value: string, timezone: string) {
  const [date, time] = value.split("T");
  return zonedDateTimeToUtc(date, time, timezone).toISOString();
}

export function PollForm({
  communityId,
  communitySlug,
  timezone,
  suggestions,
  preferredDate,
}: {
  communityId: string;
  communitySlug: string;
  timezone: string;
  suggestions: SuggestedDate[];
  preferredDate?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<PollType>("SINGLE_CHOICE");
  const [options, setOptions] = useState(["", "", ""]);
  const [selectedDates, setSelectedDates] = useState(() => {
    const orderedDates = [
      ...(preferredDate ? [preferredDate] : []),
      ...suggestions.map((suggestion) => suggestion.date),
    ];
    return new Set(Array.from(new Set(orderedDates)).slice(0, 3));
  });
  const [manualDates, setManualDates] = useState<string[]>([""]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => new Set([...selectedDates, ...manualDates.filter(Boolean)]).size,
    [manualDates, selectedDates],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const closesAt = String(form.get("closesAt") || "");
    const common = {
      title: String(form.get("title")),
      description: String(form.get("description") || ""),
      type,
      allowVoteChange: form.get("allowVoteChange") === "on",
      closesAt: closesAt ? localDateTimeToUtc(closesAt, timezone) : null,
    };
    const body =
      type === "DATE_OPTIONS"
        ? {
            ...common,
            dates: Array.from(new Set([...selectedDates, ...manualDates.filter(Boolean)])).sort(),
          }
        : { ...common, options: options.map((option) => option.trim()).filter(Boolean) };
    const response = await fetch(`/api/communities/${communityId}/polls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      poll?: { id: string };
    };
    setPending(false);
    if (!response.ok || !result.poll) {
      setError(result.error ?? "Não foi possível criar a votação.");
      return;
    }
    router.push(`/app/${communitySlug}/polls/${result.poll.id}`);
    router.refresh();
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <form className="card form poll-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="poll-title">Título</label>
        <input id="poll-title" name="title" maxLength={160} required />
      </div>
      <div className="field">
        <label htmlFor="poll-description">Descrição</label>
        <textarea id="poll-description" name="description" maxLength={5000} rows={4} />
      </div>
      <div className="field">
        <label htmlFor="poll-type">Tipo de votação</label>
        <select
          id="poll-type"
          value={type}
          onChange={(event) => setType(event.target.value as PollType)}
        >
          <option value="SINGLE_CHOICE">Escolha única</option>
          <option value="MULTIPLE_CHOICE">Múltipla escolha</option>
          <option value="DATE_OPTIONS">Datas sugeridas</option>
        </select>
        <span className="field-help">
          {type === "SINGLE_CHOICE"
            ? "Cada membro escolhe uma opção."
            : type === "MULTIPLE_CHOICE"
              ? "Cada membro pode selecionar várias opções."
              : "Cada membro marca todas as datas que funcionam para ele."}
        </span>
      </div>
      {type === "DATE_OPTIONS" ? (
        <fieldset className="poll-options-fieldset">
          <legend>Datas candidatas</legend>
          <p className="muted small">
            Sugestões ordenadas pela disponibilidade da comunidade. Selecione pelo menos duas.
          </p>
          <div className="date-suggestion-grid">
            {suggestions.map((suggestion) => (
              <label className="date-suggestion" key={suggestion.date}>
                <input
                  checked={selectedDates.has(suggestion.date)}
                  onChange={() => toggleDate(suggestion.date)}
                  type="checkbox"
                />
                <span>
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${suggestion.date}T00:00:00Z`))}
                  </strong>
                  <small>
                    {suggestion.fullAvailableCount}/{suggestion.totalMembers} livres · score{" "}
                    {suggestion.score}
                  </small>
                  <small>{suggestion.unknownCount} sem informação</small>
                </span>
              </label>
            ))}
          </div>
          <div className="manual-dates">
            <strong>Outras datas</strong>
            {manualDates.map((date, index) => (
              <div className="option-editor-row" key={index}>
                <div className="field">
                  <label htmlFor={`manual-date-${index}`}>Data adicional {index + 1}</label>
                  <input
                    id={`manual-date-${index}`}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setManualDates((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    type="date"
                    value={date}
                  />
                </div>
                {manualDates.length > 1 && (
                  <button
                    aria-label={`Remover data adicional ${index + 1}`}
                    className="button ghost"
                    onClick={() =>
                      setManualDates((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            {manualDates.length < 5 && (
              <button
                className="button secondary"
                onClick={() => setManualDates((current) => [...current, ""])}
                type="button"
              >
                Adicionar outra data
              </button>
            )}
            <span className="field-help">{selectedCount} datas selecionadas.</span>
          </div>
        </fieldset>
      ) : (
        <fieldset className="poll-options-fieldset">
          <legend>Opções</legend>
          <div className="poll-option-editors">
            {options.map((option, index) => (
              <div className="option-editor-row" key={index}>
                <div className="field">
                  <label htmlFor={`poll-option-${index}`}>Opção {index + 1}</label>
                  <input
                    id={`poll-option-${index}`}
                    maxLength={160}
                    onChange={(event) =>
                      setOptions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    required={index < 2}
                    value={option}
                  />
                </div>
                {options.length > 2 && (
                  <button
                    aria-label={`Remover opção ${index + 1}`}
                    className="button ghost"
                    onClick={() =>
                      setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    type="button"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < 20 && (
            <button
              className="button secondary"
              onClick={() => setOptions((current) => [...current, ""])}
              type="button"
            >
              Adicionar opção
            </button>
          )}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor="poll-closes">Prazo para votar (opcional)</label>
        <input id="poll-closes" name="closesAt" type="datetime-local" />
        <span className="field-help">Horário interpretado em {timezone}.</span>
      </div>
      <label className="toggle-row">
        <input defaultChecked name="allowVoteChange" type="checkbox" />
        Permitir que membros alterem o voto
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="actions compact-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Publicando…" : "Criar votação"}
        </button>
        <button className="button ghost" onClick={() => router.back()} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
