"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { addCivilDays, zonedDateTimeToUtc } from "@/lib/dates/civil-date";

type InitialEvent = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  locationName: string;
  locationAddress: string;
  locationUrl: string;
  estimatedCost: string;
  currency: string;
  participantLimit: string;
  allowMaybe: boolean;
  allowPartialAttendance: boolean;
};

function utcFromLocal(value: string, timezone: string) {
  const [date, time] = value.split("T");
  return zonedDateTimeToUtc(date, time, timezone).toISOString();
}

export function EventForm({
  communityId,
  communitySlug,
  timezone,
  initial,
  eventId,
}: {
  communityId: string;
  communitySlug: string;
  timezone: string;
  initial: InitialEvent;
  eventId?: string;
}) {
  const router = useRouter();
  const [allDay, setAllDay] = useState(initial.allDay);
  const [allowPartialAttendance, setAllowPartialAttendance] = useState(
    initial.allowPartialAttendance,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);

    try {
      const startValue = String(form.get("startsAt"));
      const endValue = String(form.get("endsAt") || "");
      const startsAt = allDay
        ? zonedDateTimeToUtc(startValue, "00:00", timezone).toISOString()
        : utcFromLocal(startValue, timezone);
      const endsAt = !endValue
        ? null
        : allDay
          ? zonedDateTimeToUtc(addCivilDays(endValue, 1), "00:00", timezone).toISOString()
          : utcFromLocal(endValue, timezone);
      const cost = String(form.get("estimatedCost") || "");
      const limit = String(form.get("participantLimit") || "");
      const body = {
        title: String(form.get("title")),
        description: String(form.get("description") || ""),
        startsAt,
        endsAt,
        allDay,
        timezone,
        locationName: String(form.get("locationName") || ""),
        locationAddress: String(form.get("locationAddress") || ""),
        locationUrl: String(form.get("locationUrl") || ""),
        estimatedCost: cost ? Number(cost) : null,
        currency: String(form.get("currency") || "BRL"),
        participantLimit: limit ? Number(limit) : null,
        allowMaybe: form.get("allowMaybe") === "on",
        allowPartialAttendance,
      };
      const response = await fetch(
        eventId
          ? `/api/communities/${communityId}/events/${eventId}`
          : `/api/communities/${communityId}/events`,
        {
          method: eventId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        event?: { id: string };
      };
      if (!response.ok) {
        setError(result.error ?? "Não foi possível salvar o evento.");
        return;
      }
      const savedId = eventId ?? result.event?.id;
      router.push(`/app/${communitySlug}/events/${savedId}`);
      router.refresh();
    } catch {
      setError("Confira as datas e horários informados.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card form event-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="event-title">Título</label>
        <input
          id="event-title"
          name="title"
          defaultValue={initial.title}
          maxLength={160}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="event-description">Descrição</label>
        <textarea
          id="event-description"
          name="description"
          defaultValue={initial.description}
          maxLength={5000}
          rows={5}
        />
      </div>
      <label className="toggle-row">
        <input
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
          type="checkbox"
        />
        Evento de dia inteiro
      </label>
      <div className="form-row">
        <div className="field">
          <label htmlFor="event-start">Início</label>
          <input
            key={`start-${allDay}`}
            id="event-start"
            name="startsAt"
            type={allDay ? "date" : "datetime-local"}
            defaultValue={allDay ? initial.startsAt.slice(0, 10) : initial.startsAt}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="event-end">Término {allDay ? "(inclusive)" : "(opcional)"}</label>
          <input
            key={`end-${allDay}`}
            id="event-end"
            name="endsAt"
            type={allDay ? "date" : "datetime-local"}
            defaultValue={allDay ? initial.endsAt.slice(0, 10) : initial.endsAt}
            required={allDay}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="event-location">Local</label>
          <input id="event-location" name="locationName" defaultValue={initial.locationName} />
        </div>
        <div className="field">
          <label htmlFor="event-address">Endereço</label>
          <input id="event-address" name="locationAddress" defaultValue={initial.locationAddress} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="event-location-url">Link do local</label>
        <input
          id="event-location-url"
          name="locationUrl"
          defaultValue={initial.locationUrl}
          placeholder="https://"
          type="url"
        />
      </div>
      <div className="form-row event-numbers">
        <div className="field">
          <label htmlFor="event-cost">Custo estimado</label>
          <input
            id="event-cost"
            name="estimatedCost"
            defaultValue={initial.estimatedCost}
            min="0"
            step="0.01"
            type="number"
          />
        </div>
        <div className="field">
          <label htmlFor="event-currency">Moeda</label>
          <input
            id="event-currency"
            name="currency"
            defaultValue={initial.currency}
            maxLength={3}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="event-limit">Limite de participantes</label>
          <input
            id="event-limit"
            name="participantLimit"
            defaultValue={initial.participantLimit}
            min="1"
            step="1"
            type="number"
          />
        </div>
      </div>
      <fieldset className="event-rsvp-settings">
        <legend>Opções de participação</legend>
        <label className="toggle-row">
          <input defaultChecked={initial.allowMaybe} name="allowMaybe" type="checkbox" />
          Permitir a resposta “Talvez”
        </label>
        <label className="toggle-row">
          <input
            checked={allowPartialAttendance}
            onChange={(event) => setAllowPartialAttendance(event.target.checked)}
            type="checkbox"
          />
          Permitir participação em dias específicos
        </label>
        <span className="field-help">
          Use a escolha de dias em viagens e encontros com mais de um dia. Se o período do evento
          for alterado depois, seleções de dias existentes voltam para “evento inteiro”.
        </span>
      </fieldset>
      <p className="field-help">Datas e horários são interpretados em {timezone}.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="actions compact-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Salvando…" : eventId ? "Salvar alterações" : "Criar evento"}
        </button>
        <button className="button ghost" onClick={() => router.back()} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
