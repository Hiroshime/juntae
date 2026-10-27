"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { packingListSchema } from "@/lib/validation/packing-list";
import { packingListRequest } from "./request";

export function PackingListForm({
  communityId,
  communitySlug,
  events,
  initialEventId,
  list,
  onSaved,
}: {
  communityId: string;
  communitySlug: string;
  events: { id: string; title: string }[];
  initialEventId?: string;
  list?: { id: string; title: string; description: string | null; eventId: string | null };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = packingListSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Confira os campos.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await packingListRequest(
        `/api/communities/${communityId}/packing-lists${list ? `/${list.id}` : ""}`,
        list ? "PATCH" : "POST",
        parsed.data,
      );
      if (list) onSaved?.();
      else if (result.list) router.push(`/app/${communitySlug}/packing-lists/${result.list.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a lista.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset className="packing-fields" disabled={pending}>
        <div className="field">
          <label htmlFor="list-title">Título da lista</label>
          <input
            id="list-title"
            name="title"
            required
            minLength={2}
            maxLength={160}
            defaultValue={list?.title}
            placeholder="Café da manhã na chácara"
          />
        </div>
        <div className="field">
          <label htmlFor="list-description">Descrição (opcional)</label>
          <textarea
            id="list-description"
            name="description"
            maxLength={2000}
            rows={3}
            defaultValue={list?.description || ""}
            placeholder="Combine os detalhes com a turma."
          />
        </div>
        <div className="field">
          <label htmlFor="list-event">Evento relacionado (opcional)</label>
          <select
            id="list-event"
            name="eventId"
            defaultValue={list?.eventId || initialEventId || ""}
          >
            <option value="">Sem evento</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit">
          {pending ? "Salvando…" : list ? "Salvar lista" : "Criar lista"}
        </button>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
