import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AvailabilityForms } from "@/features/availability/availability-forms";
import { availabilityStatusLabels, statusClass } from "@/features/availability/status";
import {
  addCivilDays,
  civilDateInTimeZone,
  formatCivilDate,
  parseCivilDate,
} from "@/lib/dates/civil-date";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMyCalendar, listAvailabilityOverrides } from "@/server/services/availability-service";
import { getMembershipBySlug } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

function monthBounds(requested: string | undefined, fallbackDate: string) {
  const fallbackMonth = fallbackDate.slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested! : fallbackMonth;
  try {
    const startDate = `${month}-01`;
    const start = parseCivilDate(startDate);
    start.setUTCMonth(start.getUTCMonth() + 1);
    const nextMonth = formatCivilDate(start).slice(0, 7);
    return { month, startDate, endDate: addCivilDays(`${nextMonth}-01`, -1), nextMonth };
  } catch {
    return monthBounds(undefined, fallbackDate);
  }
}

export default async function MyAgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/agenda/me`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();

  const today = civilDateInTimeZone(new Date(), user.timezone);
  const { startDate, endDate, nextMonth } = monthBounds((await searchParams).month, today);
  const previousMonth = addCivilDays(startDate, -1).slice(0, 7);
  const [calendar, overrides] = await Promise.all([
    getMyCalendar(user.id, membership.communityId, {
      startDate,
      endDate,
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL",
      memberIds: [user.id],
    }),
    listAvailabilityOverrides(user.id, membership.communityId),
  ]);
  const firstWeekday = parseCivilDate(startDate).getUTCDay();

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Minha agenda</div>
              <h1>Disponibilidade pessoal</h1>
              <p className="lead">
                Sua escala recorrente é a base; ocorrências manuais sempre prevalecem.
              </p>
            </div>
            <Link className="button secondary" href={`/app/${slug}/agenda/schedules`}>
              Gerenciar escalas
            </Link>
          </div>

          <section className="card calendar-card">
            <div className="calendar-toolbar">
              <Link
                className="button ghost"
                href={`?month=${previousMonth}`}
                aria-label="Mês anterior"
              >
                ←
              </Link>
              <h2>
                {new Intl.DateTimeFormat("pt-BR", {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(parseCivilDate(startDate))}
              </h2>
              <Link className="button ghost" href={`?month=${nextMonth}`} aria-label="Próximo mês">
                →
              </Link>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="month-grid">
              {Array.from({ length: firstWeekday }, (_, index) => (
                <span className="calendar-blank" key={`blank-${index}`} />
              ))}
              {calendar.days.map((day) => {
                const status = day.members[0]?.status ?? "UNKNOWN";
                return (
                  <article
                    aria-label={`${day.date}: ${availabilityStatusLabels[status]}${
                      day.holidays.length ? `, feriado: ${day.holidays.join(", ")}` : ""
                    }`}
                    className={`calendar-day ${statusClass(status)} ${day.date === today ? "today" : ""}`}
                    key={day.date}
                  >
                    <strong>{Number(day.date.slice(8))}</strong>
                    <span>{availabilityStatusLabels[status]}</span>
                    {day.holidays.length > 0 && (
                      <small className="calendar-holiday-label">{day.holidays.join(" · ")}</small>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <AvailabilityForms
            communityId={membership.communityId}
            initialDate={today}
            timezone={user.timezone}
            overrides={overrides.map((item) => ({
              ...item,
              startAt: item.startAt.toISOString(),
              endAt: item.endAt.toISOString(),
            }))}
          />
        </section>
      </div>
    </main>
  );
}
