"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type Member = { id: string; name: string; avatarUrl: string | null };
type EventSource = {
  id: string;
  title: string;
  startsAt: string;
  confirmedParticipantIds: string[];
};

export function CostShareCreateForm({
  communityId,
  communitySlug,
  members,
  events,
  initialEventId,
}: {
  communityId: string;
  communitySlug: string;
  members: Member[];
  events: EventSource[];
  initialEventId?: string;
}) {
  const router = useRouter();
  const initialEvent = events.find((event) => event.id === initialEventId);
  const [eventId, setEventId] = useState(initialEvent?.id ?? "");
  const [participantIds, setParticipantIds] = useState<string[]>(
    initialEvent?.confirmedParticipantIds ?? [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => new Set(participantIds), [participantIds]);

  function chooseEvent(value: string) {
    setEventId(value);
    const event = events.find((item) => item.id === value);
    if (event) setParticipantIds(event.confirmedParticipantIds);
  }

  function toggleParticipant(memberId: string) {
    setParticipantIds((current) =>
      current.includes(memberId)
        ? current.filter((participantId) => participantId !== memberId)
        : [...current, memberId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const response = await fetch(`/api/communities/${communityId}/cost-shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title")),
        description: String(form.get("description") ?? ""),
        currency: String(form.get("currency") ?? "BRL"),
        eventId,
        participantIds,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      costShare?: { id: string };
    };
    setPending(false);
    if (!response.ok || !result.costShare) {
      setError(result.error ?? "Não foi possível criar o rateio.");
      return;
    }
    router.push(`/app/${communitySlug}/cost-shares/${result.costShare.id}`);
    router.refresh();
  }

  return (
    <section className="card cost-share-create-card">
      <div className="card-header">
        <div>
          <h2>Novo rateio</h2>
          <p className="muted small">Escolha as pessoas; os itens serão divididos igualmente.</p>
        </div>
        <span>÷</span>
      </div>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cost-share-title">Título</label>
            <input
              id="cost-share-title"
              name="title"
              maxLength={160}
              placeholder="Chácara do fim de semana"
              required
            />
          </div>
          <div className="field compact-field">
            <label htmlFor="cost-share-currency">Moeda</label>
            <input
              id="cost-share-currency"
              name="currency"
              defaultValue="BRL"
              maxLength={3}
              required
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cost-share-event">Evento relacionado (opcional)</label>
          <select
            id="cost-share-event"
            value={eventId}
            onChange={(event) => chooseEvent(event.target.value)}
          >
            <option value="">Sem evento</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title} · {new Date(event.startsAt).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
          <p className="field-help">Ao escolher um evento, os confirmados são pré-selecionados.</p>
        </div>
        <div className="field">
          <label htmlFor="cost-share-description">Descrição</label>
          <textarea id="cost-share-description" name="description" maxLength={2000} rows={2} />
        </div>
        <fieldset className="member-filter cost-share-member-picker">
          <legend>Participantes ({participantIds.length})</legend>
          <div>
            {members.map((member) => (
              <label key={member.id}>
                <input
                  checked={selected.has(member.id)}
                  onChange={() => toggleParticipant(member.id)}
                  type="checkbox"
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="button" disabled={pending} type="submit">
          {pending ? "Criando…" : "Criar rateio"}
        </button>
      </form>
    </section>
  );
}
