import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/avatar";
import { CommunityCalendarMonth } from "@/features/availability/community-calendar-month";
import {
  availabilityStatusLabels,
  availabilityStatusSymbols,
  statusClass,
} from "@/features/availability/status";
import {
  addCivilDays,
  addCivilMonths,
  civilDateInTimeZone,
  civilMonthRange,
  isCivilMonth,
  parseCivilDate,
} from "@/lib/dates/civil-date";
import { requirePageUser } from "@/lib/auth/page-session";
import { calendarQuerySchema } from "@/lib/validation/availability";
import { rankBestDates } from "@/server/domain/availability-scoring";
import { getCommunityCalendar } from "@/server/services/availability-service";
import { getMembershipBySlug, listCommunityMembers } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

type Search = {
  startDate?: string;
  endDate?: string;
  month?: string;
  view?: string;
  onlyWeekends?: string;
  minPeople?: string;
  periodOfDay?: string;
  memberId?: string | string[];
};

type CalendarView = "month" | "list";

function capitalizeFirst(value: string) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function calendarUrl(
  slug: string,
  query: {
    startDate: string;
    endDate: string;
    onlyWeekends: boolean;
    minPeople: number;
    periodOfDay: string;
    memberIds?: string[];
  },
  view: CalendarView,
  month?: string,
) {
  const params = new URLSearchParams({ view, periodOfDay: query.periodOfDay });
  if (view === "month" && month) {
    params.set("month", month);
  } else {
    params.set("startDate", query.startDate);
    params.set("endDate", query.endDate);
  }
  if (query.onlyWeekends) params.set("onlyWeekends", "true");
  if (query.minPeople) params.set("minPeople", String(query.minPeople));
  query.memberIds?.forEach((memberId) => params.append("memberId", memberId));
  return `/app/${slug}/agenda?${params.toString()}`;
}

const statusGroupOrder = [
  "AVAILABLE",
  "DAY_OFF",
  "VACATION",
  "PARTIALLY_AVAILABLE",
  "WORKING",
  "UNAVAILABLE",
  "UNKNOWN",
] as const;

export default async function CommunityCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<Search>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/agenda`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const search = await searchParams;
  const selectedMemberIds = search.memberId
    ? Array.isArray(search.memberId)
      ? search.memberId
      : [search.memberId]
    : undefined;
  const today = civilDateInTimeZone(new Date(), user.timezone);
  const view: CalendarView =
    search.view === "list"
      ? "list"
      : search.view === "month"
        ? "month"
        : search.startDate || search.endDate
          ? "list"
          : "month";
  const monthCandidate = search.month ?? search.startDate?.slice(0, 7) ?? today.slice(0, 7);
  const month = isCivilMonth(monthCandidate) ? monthCandidate : today.slice(0, 7);
  const monthRange = civilMonthRange(month);
  const parsed = calendarQuerySchema.safeParse({
    startDate: view === "month" ? monthRange.startDate : (search.startDate ?? today),
    endDate: view === "month" ? monthRange.endDate : (search.endDate ?? addCivilDays(today, 29)),
    onlyWeekends: search.onlyWeekends ?? false,
    minPeople: search.minPeople ?? 0,
    periodOfDay: search.periodOfDay ?? "ALL",
    memberIds: selectedMemberIds,
  });
  const query = parsed.success
    ? parsed.data
    : calendarQuerySchema.parse({
        startDate: view === "month" ? monthRange.startDate : today,
        endDate: view === "month" ? monthRange.endDate : addCivilDays(today, 29),
        onlyWeekends: false,
        minPeople: 0,
        periodOfDay: "ALL",
      });
  const [calendar, communityMembers] = await Promise.all([
    getCommunityCalendar(user.id, membership.communityId, query),
    listCommunityMembers(user.id, membership.communityId),
  ]);
  const bestDates = rankBestDates(calendar.days.map((day) => day.summary)).slice(0, 5);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Calendário da comunidade</div>
              <h1>Quando todo mundo pode?</h1>
              <p className="lead">
                Compare escalas e ocorrências manuais sem tratar ausência de informação como
                disponibilidade.
              </p>
            </div>
          </div>

          <div className="calendar-view-toolbar">
            <nav className="segmented-control" aria-label="Visualização do calendário">
              <Link
                aria-current={view === "month" ? "page" : undefined}
                href={calendarUrl(slug, query, "month", month)}
              >
                <span aria-hidden="true">▦</span> Mês
              </Link>
              <Link
                aria-current={view === "list" ? "page" : undefined}
                href={calendarUrl(slug, query, "list")}
              >
                <span aria-hidden="true">☷</span> Lista
              </Link>
            </nav>
            {view === "month" && (
              <nav className="month-navigation" aria-label="Navegação entre meses">
                <Link
                  aria-label="Mês anterior"
                  href={calendarUrl(slug, query, "month", addCivilMonths(month, -1))}
                >
                  ←
                </Link>
                <strong>
                  {capitalizeFirst(
                    new Intl.DateTimeFormat("pt-BR", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(parseCivilDate(monthRange.startDate)),
                  )}
                </strong>
                <Link
                  aria-label="Próximo mês"
                  href={calendarUrl(slug, query, "month", addCivilMonths(month, 1))}
                >
                  →
                </Link>
              </nav>
            )}
          </div>

          <form className={`card calendar-filters calendar-filters-${view}`} method="get">
            <input name="view" type="hidden" value={view} />
            {view === "month" ? (
              <div className="field">
                <label htmlFor="calendar-month">Mês</label>
                <input id="calendar-month" name="month" defaultValue={month} type="month" />
              </div>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="calendar-start">De</label>
                  <input
                    id="calendar-start"
                    name="startDate"
                    defaultValue={query.startDate}
                    type="date"
                  />
                </div>
                <div className="field">
                  <label htmlFor="calendar-end">Até</label>
                  <input
                    id="calendar-end"
                    name="endDate"
                    defaultValue={query.endDate}
                    type="date"
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="calendar-period">Período</label>
              <select id="calendar-period" name="periodOfDay" defaultValue={query.periodOfDay}>
                <option value="ALL">Dia inteiro</option>
                <option value="MORNING">Manhã · 6h–12h</option>
                <option value="AFTERNOON">Tarde · 12h–18h</option>
                <option value="EVENING">Noite · após 18h</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="calendar-min">Mínimo disponíveis</label>
              <input
                id="calendar-min"
                min={0}
                name="minPeople"
                defaultValue={query.minPeople}
                type="number"
              />
            </div>
            <label className="toggle-row">
              <input
                defaultChecked={query.onlyWeekends}
                name="onlyWeekends"
                type="checkbox"
                value="true"
              />
              Somente fins de semana
            </label>
            <fieldset className="member-filter full-span">
              <legend>
                Membros específicos <span className="muted">(opcional)</span>
              </legend>
              <div>
                {communityMembers.map((member) => (
                  <label key={member.userId}>
                    <input
                      defaultChecked={query.memberIds?.includes(member.userId)}
                      name="memberId"
                      type="checkbox"
                      value={member.userId}
                    />
                    <span>{member.displayName || member.user.name}</span>
                  </label>
                ))}
              </div>
              <p className="field-help">Sem seleção, todos os membros entram no cálculo.</p>
            </fieldset>
            <button className="button" type="submit">
              Aplicar filtros
            </button>
          </form>
          {(!parsed.success || (search.month !== undefined && !isCivilMonth(search.month))) && (
            <div className="error">
              Os filtros inválidos foram restaurados para o período padrão.
            </div>
          )}

          {bestDates.length > 0 && (
            <section className="best-dates-section">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Melhores datas</div>
                  <h2>Maior sobreposição</h2>
                </div>
                <span className="muted small">score transparente</span>
              </div>
              <div className="best-dates-grid">
                {bestDates.map((day, index) => (
                  <article className="card best-date" key={day.date}>
                    <span className="rank">#{index + 1}</span>
                    <strong>
                      {new Intl.DateTimeFormat("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      }).format(parseCivilDate(day.date))}
                    </strong>
                    <span>
                      {day.fullAvailableCount}/{day.totalMembers} completamente disponíveis
                    </span>
                    <span>
                      {day.partialAvailableCount} parciais · {day.unknownCount} sem informação
                    </span>
                    <div className="score">Score {day.score}</div>
                  </article>
                ))}
              </div>
              <div className="score-explainer">
                <strong>Como calculamos:</strong> disponível, folga ou férias = 1 ponto; parcial =
                0,5; trabalhando, indisponível ou sem informação = 0. Em empates, priorizamos mais
                pessoas completamente disponíveis, menos desconhecidos e a data mais próxima.
              </div>
            </section>
          )}

          {view === "month" ? (
            <CommunityCalendarMonth
              communitySlug={slug}
              days={calendar.days}
              monthEnd={monthRange.endDate}
              monthStart={monthRange.startDate}
              today={today}
            />
          ) : (
            <section className="calendar-list" aria-label="Disponibilidade por dia">
              {calendar.days.length ? (
                calendar.days.map((day) => (
                  <details className="card community-day" key={day.date}>
                    <summary>
                      <div className="day-title">
                        <strong>
                          {new Intl.DateTimeFormat("pt-BR", {
                            weekday: "long",
                            day: "2-digit",
                            month: "long",
                            timeZone: "UTC",
                          }).format(parseCivilDate(day.date))}
                        </strong>
                        <span className="muted small">Score {day.summary.score}</span>
                        {day.holidays.length > 0 && (
                          <span className="calendar-holiday-label">
                            🎉 {day.holidays.join(" · ")}
                          </span>
                        )}
                        <span className="muted small">
                          {day.summary.totalMembers}{" "}
                          {day.summary.totalMembers === 1 ? "membro" : "membros"} no cálculo
                        </span>
                      </div>
                      <div className="day-counts">
                        <span className="availability-badge availability-available">
                          {day.summary.fullAvailableCount} livres
                        </span>
                        <span className="availability-badge availability-partially-available">
                          {day.summary.partialAvailableCount} parciais
                        </span>
                        <span className="availability-badge availability-working">
                          {day.summary.workingCount} trabalhando
                        </span>
                        <span className="availability-badge availability-unavailable">
                          {day.summary.unavailableCount} indisponíveis
                        </span>
                        <span className="availability-badge availability-unknown">
                          {day.summary.unknownCount} sem informação
                        </span>
                      </div>
                    </summary>
                    <div className="day-member-groups">
                      {statusGroupOrder.map((status) => {
                        const members = day.members.filter((member) => member.status === status);
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
                                  <span>{member.name}</span>
                                </div>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </details>
                ))
              ) : (
                <div className="card empty-state">
                  <span className="empty-icon">🔎</span>
                  <h2>Nenhuma data atende aos filtros</h2>
                  <p className="muted">Reduza o mínimo de pessoas ou amplie o intervalo.</p>
                </div>
              )}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
