export type PollEventSource = { id: string; title: string; startsAt: string; timezone: string };

export function PollEventField({
  events,
  initialEventId,
}: {
  events: PollEventSource[];
  initialEventId?: string | null;
}) {
  return (
    <div className="field">
      <label htmlFor="poll-event">Evento relacionado (opcional)</label>
      <select id="poll-event" name="eventId" defaultValue={initialEventId || ""}>
        <option value="">Sem evento</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.title} ·{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeZone: event.timezone,
            }).format(new Date(event.startsAt))}
          </option>
        ))}
      </select>
      <p className="field-help">
        O vínculo organiza a votação no evento. Todos os membros da comunidade continuam podendo
        votar.
      </p>
    </div>
  );
}
