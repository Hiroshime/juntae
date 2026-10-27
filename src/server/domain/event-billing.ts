import type { EventBillingMode } from "@prisma/client";
import { z } from "zod";
import {
  addCivilDays,
  civilDateInTimeZone,
  civilDateRange,
  daysBetweenCivilDates,
  formatCivilDate,
} from "@/lib/dates/civil-date";
import { billingSelectionSchema } from "@/lib/validation/event-billing";
import { eventAttendanceDates } from "./events";

export type BillingPerson = { id: string; name: string };
const cents = z.number().int().nonnegative().safe();
export const periodAllocationSchema = z.object({
  date: z.string(),
  label: z.string(),
  amountCents: cents,
  participants: z.array(z.object({ id: z.string(), name: z.string(), shareCents: cents })),
});
export type BillingPeriod = { date: string; label: string; participants: BillingPerson[] };
export type BillingEvent = {
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  allDay: boolean;
  billingMode: EventBillingMode;
  billingParticipants: unknown;
  rsvps: Array<{
    userId: string;
    attendingSpecificDays: boolean;
    attendanceDays: { date: Date }[];
    user: BillingPerson & { memberships: { displayName: string | null }[] };
  }>;
};

export function billingDates(
  event: Pick<BillingEvent, "startsAt" | "endsAt" | "timezone" | "allDay">,
  mode: EventBillingMode,
) {
  if (mode === "EQUAL") return [];
  const start = civilDateInTimeZone(event.startsAt, event.timezone);
  const end =
    mode === "NIGHT" && !event.allDay
      ? civilDateInTimeZone(event.endsAt || event.startsAt, event.timezone)
      : civilDateInTimeZone(
          event.endsAt ? new Date(event.endsAt.getTime() - 1) : event.startsAt,
          event.timezone,
        );
  if (daysBetweenCivilDates(start, end) > 365) throw new Error("BILLING_PERIOD_TOO_LONG");
  const dates = civilDateRange(start, end);
  return mode === "NIGHT" ? dates.slice(0, -1) : dates;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function resolveEventBilling(event: BillingEvent) {
  const confirmed = event.rsvps.map((rsvp) => ({
    id: rsvp.userId,
    name: rsvp.user.memberships[0]?.displayName || rsvp.user.name,
  }));
  const people = new Map(confirmed.map((person) => [person.id, person]));
  const issues: string[] = [];
  const parsed = billingSelectionSchema.safeParse(event.billingParticipants);
  let selected = parsed.success && parsed.data.mode === event.billingMode ? parsed.data : null;
  let dates: string[] = [];
  if (event.billingMode !== "EQUAL") {
    try {
      dates = billingDates(event, event.billingMode);
    } catch {
      issues.push("A divisão por períodos aceita eventos de até 366 dias.");
    }
    if (!dates.length)
      issues.push("Defina um período válido. A divisão por noites exige pelo menos uma pernoite.");
    if (
      selected &&
      (selected.periods.length !== dates.length ||
        selected.periods.some((period) => !dates.includes(period.date)))
    ) {
      issues.push(
        "As datas do evento mudaram. Revise e salve novamente os participantes dos períodos.",
      );
      selected = null;
    }
    if (
      event.billingMode === "NIGHT" &&
      !selected &&
      event.rsvps.some((rsvp) => rsvp.attendingSpecificDays)
    ) {
      issues.push(
        "Revise e salve os participantes de cada noite; presença parcial não informa pernoite.",
      );
    }
  }
  const dayDates =
    daysBetweenCivilDates(
      civilDateInTimeZone(event.startsAt, event.timezone),
      civilDateInTimeZone(
        event.endsAt ? new Date(event.endsAt.getTime() - 1) : event.startsAt,
        event.timezone,
      ),
    ) <= 365
      ? eventAttendanceDates(event)
      : [];
  const days = dayDates.map((date) => ({
    date,
    participantIds: event.rsvps
      .filter(
        (rsvp) =>
          !rsvp.attendingSpecificDays ||
          rsvp.attendanceDays.some((day) => formatCivilDate(day.date) === date),
      )
      .map((rsvp) => rsvp.userId),
  }));
  const periods: BillingPeriod[] =
    event.billingMode === "EQUAL"
      ? [{ date: "", label: "Evento inteiro", participants: confirmed }]
      : dates.map((date) => {
          const override = selected?.periods.find((period) => period.date === date);
          const ids =
            override?.userIds ??
            (event.billingMode === "DAY"
              ? days.find((day) => day.date === date)?.participantIds || []
              : event.rsvps
                  .filter((rsvp) => !rsvp.attendingSpecificDays)
                  .map((rsvp) => rsvp.userId));
          if (ids.some((id) => !people.has(id)))
            issues.push(`Revise ${dateLabel(date)}: há pessoas que não estão mais confirmadas.`);
          return {
            date,
            label:
              event.billingMode === "NIGHT"
                ? `Noite ${dateLabel(date)} → ${dateLabel(addCivilDays(date, 1))}`
                : `Dia ${dateLabel(date)}`,
            participants: ids.flatMap((id) => (people.has(id) ? [people.get(id)!] : [])),
          };
        });
  return {
    mode: event.billingMode,
    confirmed,
    fullAttendanceIds: event.rsvps
      .filter((rsvp) => !rsvp.attendingSpecificDays)
      .map((rsvp) => rsvp.userId),
    periods,
    days,
    issues: [...new Set(issues)],
    manual: !!selected,
  };
}

export function allocateByPeriods(totalCents: number, periods: BillingPeriod[]) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error("INVALID_AMOUNT");
  const charges = new Map<string, number>();
  const issues: string[] = [];
  let unallocatedCents = periods.length ? 0 : totalCents;
  if (!periods.length && totalCents) issues.push("Não há períodos válidos para dividir o valor.");
  const breakdown = periods.map((period, index) => {
    const amountCents =
      Math.floor(totalCents / periods.length) + (index < totalCents % periods.length ? 1 : 0);
    const ordered = [...period.participants].sort((a, b) => a.id.localeCompare(b.id));
    if (new Set(ordered.map((person) => person.id)).size !== ordered.length)
      throw new Error("INVALID_ALLOCATION");
    if (!ordered.length && amountCents) {
      unallocatedCents += amountCents;
      issues.push(`${period.label}: há custo sem participantes. Revise a seleção.`);
    }
    const participants = ordered.map((person, personIndex) => {
      const shareCents =
        Math.floor(amountCents / ordered.length) +
        (personIndex < amountCents % ordered.length ? 1 : 0);
      charges.set(person.id, (charges.get(person.id) || 0) + shareCents);
      return { ...person, shareCents };
    });
    return { date: period.date, label: period.label, amountCents, participants };
  });
  return { charges, breakdown, unallocatedCents, issues };
}
