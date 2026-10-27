"use client";

export type AllocationType = "SELECTED" | "EVENT" | "DAY";
export function AllocationFields({
  hasEvent,
  days,
  type,
  date,
  onType,
  onDate,
}: {
  hasEvent: boolean;
  days: { date: string; participantIds: string[] }[];
  type: AllocationType;
  date: string;
  onType: (value: AllocationType) => void;
  onDate: (value: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor="allocation-type">Aplicação do rateio</label>
        <select
          id="allocation-type"
          value={type}
          onChange={(event) => onType(event.target.value as AllocationType)}
        >
          <option value="SELECTED">Pessoas selecionadas</option>
          {hasEvent && (
            <>
              <option value="EVENT">Evento inteiro (segue dias/noites do evento)</option>
              <option value="DAY">Dia específico</option>
            </>
          )}
        </select>
      </div>
      {type === "DAY" && (
        <div className="field">
          <label htmlFor="allocation-date">Dia da despesa</label>
          <select
            id="allocation-date"
            required
            value={date}
            onChange={(event) => onDate(event.target.value)}
          >
            <option value="">Selecione um dia</option>
            {days.map((day) => (
              <option key={day.date} value={day.date}>
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(
                  new Date(`${day.date}T12:00:00Z`),
                )}
              </option>
            ))}
          </select>
          <p className="field-help">
            Os confirmados nesse dia são sugeridos. Revise as pessoas abaixo antes de salvar; a
            seleção financeira fica independente do RSVP.
          </p>
        </div>
      )}
      {type === "EVENT" && (
        <p className="field-help">
          O valor segue a divisão e os participantes de cada período configurados no evento. Revise
          as pernoites na página do evento quando necessário.
        </p>
      )}
      {type === "SELECTED" && (
        <p className="field-help">
          O valor é dividido igualmente entre as pessoas marcadas. Quem pagou uma compra pode ficar
          fora dessa seleção em rateios de eventos.
        </p>
      )}
    </>
  );
}
