"use client";

import type { AvailabilityStatus } from "@prisma/client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import {
  calendarEventRsvpClass,
  calendarEventRsvpLabel,
  type CommunityCalendarEvent,
} from "@/lib/calendar-events";
import {
  availabilityStatusLabels,
  availabilityStatusSymbols,
  statusClass,
} from "@/features/availability/status";
import {
  ScheduleAvailabilityHint,
  type ScheduleAvailabilityWindow,
} from "@/features/availability/schedule-availability-hint";
import { civilDateInTimeZone, civilDateRange, parseCivilDate } from "@/lib/dates/civil-date";

export type CommunityCalendarDay = {
  date: string;
  holidays: string[];
  members: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    status: AvailabilityStatus;
    schedule: ScheduleAvailabilityWindow | null;
  }>;
  summary: CalendarSummary;
  periodSummaries: Record<CalendarPeriod, CalendarSummary>;
};

type CalendarPeriod = "ALL" | "MORNING" | "AFTERNOON" | "EVENING";
type CalendarSummary = {
  fullAvailableCount: number;
  partialAvailableCount: number;
  workingCount: number;
  unavailableCount: number;
  unknownCount: number;
  totalMembers: number;
  score: number;
};

const calendarPeriods = [
  { key: "ALL", shortLabel: "Dia", label: "Dia inteiro" },
  { key: "MORNING", shortLabel: "Man", label: "Manhã, das 6h às 12h" },
  { key: "AFTERNOON", shortLabel: "Tar", label: "Tarde, das 12h às 18h" },
  { key: "EVENING", shortLabel: "Noi", label: "Noite, após as 18h" },
] as const satisfies ReadonlyArray<{
  key: CalendarPeriod;
  shortLabel: string;
  label: string;
}>;

const statusOrder: AvailabilityStatus[] = [
  "AVAILABLE",
  "DAY_OFF",
  "VACATION",
  "PARTIALLY_AVAILABLE",
  "WORKING",
  "UNAVAILABLE",
  "UNKNOWN",
];

const longDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatLongDate(date: string) {
  const formatted = longDate.format(parseCivilDate(date));
  return formatted.charAt(0).toLocaleUpperCase("pt-BR") + formatted.slice(1);
}

function availabilityLevel(summary: CalendarSummary) {
  if (!summary.totalMembers || summary.unknownCount === summary.totalMembers) {
    return "unknown";
  }
  const ratio =
    (summary.fullAvailableCount + summary.partialAvailableCount * 0.5) / summary.totalMembers;
  if (ratio >= 0.7) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

function dayAriaLabel(day: CommunityCalendarDay, events: CommunityCalendarEvent[]) {
  const date = formatLongDate(day.date);
  const holidays = day.holidays.length ? `, feriado: ${day.holidays.join(", ")}` : "";
  const periods = calendarPeriods
    .map(({ key, label }) => {
      const summary = day.periodSummaries[key];
      return `${label}: ${summary.fullAvailableCount} livres e ${summary.partialAvailableCount} parciais de ${summary.totalMembers}`;
    })
    .join("; ");
  const eventSummary = events.length
    ? `; ${events.length} ${events.length === 1 ? "evento" : "eventos"}: ${events
        .map((event) => `${event.title}, ${calendarEventRsvpLabel(event.myRsvp)}`)
        .join("; ")}`
    : "";
  return `${date}: ${periods}${holidays}${eventSummary}`;
}

function eventTimeLabel(event: CommunityCalendarEvent, date: string) {
  if (event.allDay) return "Dia inteiro";
  const startDate = civilDateInTimeZone(new Date(event.startsAt), event.timezone);
  if (startDate !== date) return "Em andamento";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: event.timezone,
  }).format(new Date(event.startsAt));
}

export function CalendarEventList({
  communitySlug,
  date,
  events,
}: {
  communitySlug: string;
  date: string;
  events: CommunityCalendarEvent[];
}) {
  if (!events.length) return null;
  const headingId = `calendar-events-${date}`;

  return (
    <section className="calendar-event-list" aria-labelledby={headingId}>
      <h3 id={headingId}>Eventos do dia</h3>
      <ul>
        {events.map((event) => (
          <li
            className={`calendar-event-row ${calendarEventRsvpClass(event.myRsvp)}${event.status === "CANCELLED" ? " is-cancelled" : ""}`}
            key={event.id}
          >
            <div className="calendar-event-row-heading">
              <Link href={`/app/${communitySlug}/events/${event.id}`}>{event.title}</Link>
              <span className="calendar-event-rsvp">{calendarEventRsvpLabel(event.myRsvp)}</span>
            </div>
            <small>
              {event.status === "CANCELLED" ? "Cancelado · " : ""}
              {eventTimeLabel(event, date)}
              {event.myAttendanceDates.length > 0 ? " · presença parcial configurada" : ""}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CommunityCalendarMonth({
  days,
  monthStart,
  monthEnd,
  today,
  communitySlug,
  events,
}: {
  days: CommunityCalendarDay[];
  monthStart: string;
  monthEnd: string;
  today: string;
  communitySlug: string;
  events: CommunityCalendarEvent[];
}) {
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CommunityCalendarEvent[]>();
    for (const event of events) {
      for (const date of event.dates) {
        const dateEvents = map.get(date) ?? [];
        dateEvents.push(event);
        map.set(date, dateEvents);
      }
    }
    return map;
  }, [events]);
  const initialDate = dayMap.has(today) ? today : days[0]?.date;
  const [selectedDate, setSelectedDate] = useState<string | undefined>(initialDate);
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined;
  const monthDates = civilDateRange(monthStart, monthEnd);
  const leadingDays = (parseCivilDate(monthStart).getUTCDay() + 6) % 7;

  return (
    <section className="calendar-month-section" aria-labelledby="month-calendar-title">
      <h2 className="sr-only" id="month-calendar-title">
        Calendário mensal de disponibilidade
      </h2>
      <div className="calendar-month-weekdays" aria-hidden="true">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <ol className="calendar-month-grid" aria-label="Dias do mês">
        {Array.from({ length: leadingDays }, (_, index) => (
          <li aria-hidden="true" className="calendar-month-blank" key={`blank-${index}`} />
        ))}
        {monthDates.map((date) => {
          const day = dayMap.get(date);
          if (!day) {
            return (
              <li
                aria-label={`${formatLongDate(date)}: fora dos filtros`}
                className="calendar-month-filtered"
                key={date}
              >
                <span aria-hidden="true">
                  <strong>{Number(date.slice(-2))}</strong>
                  <small>—</small>
                </span>
              </li>
            );
          }
          const selected = selectedDate === date;
          const dayEvents = eventsByDate.get(date) ?? [];
          return (
            <li key={date}>
              <button
                aria-label={dayAriaLabel(day, dayEvents)}
                aria-pressed={selected}
                className={`calendar-month-day${date === today ? " is-today" : ""}`}
                data-date={date}
                onClick={() => setSelectedDate(date)}
                type="button"
              >
                <span className="calendar-month-number">{Number(date.slice(-2))}</span>
                <span className="calendar-month-periods" aria-hidden="true">
                  {calendarPeriods.map(({ key, shortLabel, label }) => {
                    const summary = day.periodSummaries[key];
                    return (
                      <span
                        className={`calendar-period-summary level-${availabilityLevel(summary)}${key === "ALL" ? " is-all-day" : ""}`}
                        key={key}
                        title={`${label}: ${summary.fullAvailableCount} livres, ${summary.partialAvailableCount} parciais de ${summary.totalMembers}`}
                      >
                        <span>{shortLabel}</span>
                        <strong>
                          {summary.fullAvailableCount}/{summary.totalMembers}
                        </strong>
                        {summary.partialAvailableCount > 0 && (
                          <small>+{summary.partialAvailableCount}p</small>
                        )}
                      </span>
                    );
                  })}
                </span>
                {dayEvents.length > 0 && (
                  <span className="calendar-month-events" aria-hidden="true">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        className={`calendar-event-chip ${calendarEventRsvpClass(event.myRsvp)}${event.status === "CANCELLED" ? " is-cancelled" : ""}`}
                        key={event.id}
                        title={`${event.title} · ${calendarEventRsvpLabel(event.myRsvp)}`}
                      >
                        <span className="calendar-event-chip-title">{event.title}</span>
                        <span className="calendar-event-chip-status">
                          {calendarEventRsvpLabel(event.myRsvp)}
                        </span>
                      </span>
                    ))}
                    {dayEvents.length > 2 && <small>+{dayEvents.length - 2} eventos</small>}
                  </span>
                )}
                {day.holidays.length > 0 && (
                  <span className="calendar-month-holiday" title={day.holidays.join(", ")}>
                    Feriado
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="calendar-month-legend" aria-label="Legenda do calendário">
        <span>
          <i className="legend-high" />
          Alta disponibilidade
        </span>
        <span>
          <i className="legend-medium" />
          Disponibilidade média
        </span>
        <span>
          <i className="legend-low" />
          Baixa disponibilidade
        </span>
        <span>
          <i className="legend-unknown" />
          Sem informação
        </span>
        <span className="calendar-partial-legend">
          <strong>+Np</strong>N pessoas parcialmente disponíveis
        </span>
        <span>
          <i className="legend-event-going" />
          Evento: vou
        </span>
        <span>
          <i className="legend-event-maybe" />
          Evento: talvez
        </span>
        <span>
          <i className="legend-event-not-going" />
          Evento: não vou
        </span>
        <span>
          <i className="legend-event-no-response" />
          Evento: sem resposta
        </span>
      </div>

      {selectedDay ? (
        <section className="calendar-selected-day" aria-live="polite">
          <div className="calendar-selected-heading">
            <div>
              <div className="eyebrow">Detalhes do dia</div>
              <h2>{formatLongDate(selectedDay.date)}</h2>
              {selectedDay.holidays.length > 0 && (
                <p className="calendar-holiday-label">🎉 {selectedDay.holidays.join(" · ")}</p>
              )}
              <p className="muted small">
                Score {selectedDay.summary.score} · {selectedDay.summary.totalMembers}{" "}
                {selectedDay.summary.totalMembers === 1 ? "membro" : "membros"} no cálculo
              </p>
            </div>
            <div className="actions compact-actions">
              <Link
                className="button secondary"
                href={`/app/${communitySlug}/events/new?date=${selectedDay.date}`}
              >
                Criar evento
              </Link>
              <Link
                className="button ghost"
                href={`/app/${communitySlug}/polls/new?date=${selectedDay.date}`}
              >
                Criar votação
              </Link>
            </div>
          </div>
          <div className="calendar-selected-periods" aria-label="Disponibilidade por período">
            {calendarPeriods.map(({ key, label }) => {
              const summary = selectedDay.periodSummaries[key];
              return (
                <div className={`level-${availabilityLevel(summary)}`} key={key}>
                  <span>{label}</span>
                  <strong>
                    {summary.fullAvailableCount}/{summary.totalMembers} livres
                  </strong>
                  <small>
                    {summary.partialAvailableCount} parciais · {summary.unknownCount} sem informação
                  </small>
                </div>
              );
            })}
          </div>
          <CalendarEventList
            communitySlug={communitySlug}
            date={selectedDay.date}
            events={eventsByDate.get(selectedDay.date) ?? []}
          />
          <div className="calendar-selected-groups">
            {statusOrder.map((status) => {
              const members = selectedDay.members.filter((member) => member.status === status);
              if (!members.length) return null;
              return (
                <section className="day-status-group" key={status}>
                  <h3>
                    <span className={`availability-badge ${statusClass(status)}`}>
                      <span aria-hidden="true">{availabilityStatusSymbols[status]}</span>{" "}
                      {availabilityStatusLabels[status]}
                    </span>
                    <span>{members.length}</span>
                  </h3>
                  <div className="day-members">
                    {members.map((member) => (
                      <div className="day-member" key={member.id}>
                        <Avatar name={member.name} url={member.avatarUrl} size="small" />
                        <span className="day-member-copy">
                          <span>{member.name}</span>
                          <ScheduleAvailabilityHint schedule={member.schedule} />
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state compact calendar-filter-empty" role="status">
          <strong>Nenhum dia deste mês atende aos filtros.</strong>
          <span className="muted small">Ajuste o mínimo de pessoas ou remova filtros.</span>
        </div>
      )}
    </section>
  );
}
