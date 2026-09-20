import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { rsvpStatusLabels } from "@/features/events/status";
import { formatPollDeadline, pollTypeLabels } from "@/features/polls/status";
import { requirePageUser } from "@/lib/auth/page-session";
import { parseCivilDate } from "@/lib/dates/civil-date";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getCommunityDashboard } from "@/server/services/dashboard-service";

export const dynamic = "force-dynamic";

function formatOpportunityDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(parseCivilDate(date));
}

function formatCompactEventDate(event: { startsAt: Date; allDay: boolean; timezone: string }) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    ...(event.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
    timeZone: event.timezone,
  }).format(event.startsAt);
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const dashboard = await getCommunityDashboard(user.id, membership.communityId, user.timezone);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page dashboard-page">
          <div className="page-heading dashboard-heading">
            <div>
              <div className="eyebrow">Dashboard da comunidade</div>
              <h1>{membership.community.name}</h1>
              <p className="lead">
                {membership.community.description ??
                  "Os próximos encontros, decisões e melhores dias da comunidade."}
              </p>
            </div>
            <div className="actions compact-actions dashboard-primary-actions">
              <Link className="button" href={`/app/${slug}/events/new`}>
                Criar evento
              </Link>
              <Link className="button secondary" href={`/app/${slug}/polls/new`}>
                Nova votação
              </Link>
            </div>
          </div>

          <section className="card dashboard-opportunities" aria-labelledby="opportunities-title">
            <div className="card-header">
              <div>
                <div className="eyebrow">Melhores oportunidades</div>
                <h2 id="opportunities-title">Quando mais gente consegue</h2>
              </div>
              <Link className="small" href={`/app/${slug}/agenda`}>
                Abrir calendário
              </Link>
            </div>
            <div className="opportunity-grid">
              {dashboard.bestOpportunities.map((opportunity, index) => {
                const availabilityPercent = opportunity.totalMembers
                  ? Math.round((opportunity.fullAvailableCount / opportunity.totalMembers) * 100)
                  : 0;
                return (
                  <article className="opportunity-card" key={opportunity.date}>
                    <div className="opportunity-rank">#{index + 1} oportunidade</div>
                    <h3>{formatOpportunityDate(opportunity.date)}</h3>
                    <div className="opportunity-main-metric">
                      <strong>{opportunity.fullAvailableCount}</strong>
                      <span>de {opportunity.totalMembers} completamente disponíveis</span>
                    </div>
                    <div
                      aria-label={`${availabilityPercent}% completamente disponíveis`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={availabilityPercent}
                      className="opportunity-progress"
                      role="progressbar"
                    >
                      <span style={{ width: `${availabilityPercent}%` }} />
                    </div>
                    <div className="opportunity-breakdown">
                      <span>{opportunity.partialAvailableCount} parciais</span>
                      <span>{opportunity.unknownCount} sem informação</span>
                      <strong>Score {opportunity.score}</strong>
                    </div>
                    <div className="opportunity-actions">
                      <Link
                        className="button secondary"
                        href={`/app/${slug}/events/new?date=${opportunity.date}`}
                      >
                        Criar evento
                      </Link>
                      <Link
                        className="button ghost"
                        href={`/app/${slug}/polls/new?date=${opportunity.date}`}
                      >
                        Votar datas
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="score-explainer dashboard-score-note">
              <strong>Score transparente:</strong> disponível, folga ou férias valem 1 ponto;
              disponibilidade parcial vale 0,5; trabalho, indisponibilidade e ausência de informação
              valem 0.
            </p>
          </section>

          <div className="dashboard-content-grid">
            <section
              className="card dashboard-social-card"
              aria-labelledby="social-highlight-title"
            >
              <div className="card-header">
                <div>
                  <div className="eyebrow">Comunicação</div>
                  <h2 id="social-highlight-title">
                    {dashboard.socialHighlight ? "Em alta na comunidade" : "Converse com a turma"}
                  </h2>
                </div>
                <Link className="small" href={`/app/${slug}/social`}>
                  Abrir feed
                </Link>
              </div>
              {dashboard.socialHighlight ? (
                <Link
                  className="dashboard-social-highlight"
                  href={`/app/${slug}/social#post-${dashboard.socialHighlight.id}`}
                >
                  <div>
                    {dashboard.socialHighlight.kind === "ANNOUNCEMENT" && (
                      <span className="social-announcement-badge">📣 Comunicado</span>
                    )}
                    <strong>{dashboard.socialHighlight.authorName}</strong>
                    <p>
                      {dashboard.socialHighlight.content ||
                        `Compartilhou ${dashboard.socialHighlight.mediaCount} anexo(s).`}
                    </p>
                  </div>
                  <span>
                    {dashboard.socialHighlight.reactionCount} reações ·{" "}
                    {dashboard.socialHighlight.commentCount} comentários
                  </span>
                </Link>
              ) : (
                <div className="dashboard-social-empty">
                  <p className="muted">Ainda não há publicações nesta comunidade.</p>
                  <Link className="button secondary" href={`/app/${slug}/social`}>
                    Fazer primeira publicação
                  </Link>
                </div>
              )}
            </section>
            <section className="card dashboard-list-card" aria-labelledby="upcoming-events-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Agenda da comunidade</div>
                  <h2 id="upcoming-events-title">Próximos eventos</h2>
                </div>
                <Link className="small" href={`/app/${slug}/events`}>
                  Ver todos
                </Link>
              </div>
              {dashboard.events.length ? (
                <div className="dashboard-event-list">
                  {dashboard.events.map((event) => (
                    <Link
                      className="dashboard-event-row"
                      href={`/app/${slug}/events/${event.id}`}
                      key={event.id}
                    >
                      <time dateTime={event.startsAt.toISOString()}>
                        {formatCompactEventDate(event)}
                      </time>
                      <div>
                        <strong>{event.title}</strong>
                        <span>
                          {event.locationName ? `📍 ${event.locationName} · ` : ""}
                          {event.rsvpSummary.GOING} confirmados
                        </span>
                      </div>
                      <span className={event.myRsvp ? "pill" : "dashboard-action-hint"}>
                        {event.myRsvp ? rsvpStatusLabels[event.myRsvp] : "Responder →"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact dashboard-empty">
                  <span className="empty-icon">📅</span>
                  <strong>Nenhum evento marcado ainda.</strong>
                  <p className="muted">Transforme uma boa oportunidade no próximo encontro.</p>
                  <Link className="button secondary" href={`/app/${slug}/events/new`}>
                    Criar evento
                  </Link>
                </div>
              )}
            </section>

            <section className="card weekend-card" aria-labelledby="weekend-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Quem está livre?</div>
                  <h2 id="weekend-title">Próximo fim de semana</h2>
                </div>
                <span>☀️</span>
              </div>
              <div className="weekend-days">
                {[dashboard.nextWeekend.saturday, dashboard.nextWeekend.sunday].map((day) => (
                  <Link
                    href={`/app/${slug}/agenda?startDate=${day.date}&endDate=${day.date}`}
                    key={day.date}
                  >
                    <span>{formatOpportunityDate(day.date)}</span>
                    <strong>
                      {day.fullAvailableCount}/{day.totalMembers}
                    </strong>
                    <small>
                      {day.partialAvailableCount} parciais · {day.unknownCount} sem informação
                    </small>
                  </Link>
                ))}
              </div>
              <Link className="button secondary" href={`/app/${slug}/agenda`}>
                Ver disponibilidade detalhada
              </Link>
            </section>

            <section className="card dashboard-list-card" aria-labelledby="open-polls-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Decisões abertas</div>
                  <h2 id="open-polls-title">Votações</h2>
                </div>
                <Link className="small" href={`/app/${slug}/polls`}>
                  Ver todas
                </Link>
              </div>
              {dashboard.polls.length ? (
                <div className="dashboard-poll-list">
                  {dashboard.polls.map((poll) => (
                    <Link
                      className="dashboard-poll-row"
                      href={`/app/${slug}/polls/${poll.id}`}
                      key={poll.id}
                    >
                      <div>
                        <span className="role-badge">{pollTypeLabels[poll.type]}</span>
                        <strong>{poll.title}</strong>
                        <small>
                          {poll.totalVoters} {poll.totalVoters === 1 ? "votante" : "votantes"}
                          {poll.leadingOption && poll.totalVoters > 0
                            ? ` · na frente: ${poll.leadingOption.label}`
                            : ""}
                        </small>
                      </div>
                      <span className={poll.myVoteCount ? "pill" : "dashboard-action-hint"}>
                        {poll.myVoteCount ? "Você votou" : "Votar →"}
                      </span>
                      {poll.closesAt && (
                        <time dateTime={poll.closesAt.toISOString()}>
                          Até {formatPollDeadline(poll.closesAt, user.timezone)}
                        </time>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact dashboard-empty">
                  <span className="empty-icon">🗳️</span>
                  <strong>Nenhuma votação aberta.</strong>
                  <p className="muted">Pergunte à comunidade e decida em conjunto.</p>
                  <Link className="button secondary" href={`/app/${slug}/polls/new`}>
                    Criar votação
                  </Link>
                </div>
              )}
            </section>

            <section className="card seven-day-card" aria-labelledby="seven-days-title">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Visão rápida</div>
                  <h2 id="seven-days-title">Próximos 7 dias</h2>
                </div>
                <Link className="small" href={`/app/${slug}/agenda/me`}>
                  Atualizar minha agenda
                </Link>
              </div>
              <div className="week-summary dashboard-week-summary">
                {dashboard.nextSevenDays.map((day) => (
                  <Link
                    aria-label={`${day.date}: ${day.fullAvailableCount} de ${day.totalMembers} disponíveis`}
                    href={`/app/${slug}/agenda?startDate=${day.date}&endDate=${day.date}`}
                    key={day.date}
                  >
                    <span>
                      {new Intl.DateTimeFormat("pt-BR", {
                        weekday: "short",
                        timeZone: "UTC",
                      }).format(parseCivilDate(day.date))}
                    </span>
                    <strong>{day.fullAvailableCount}</strong>
                    <small>de {day.totalMembers}</small>
                    <i>{day.unknownCount} ?</i>
                  </Link>
                ))}
              </div>
              <div className="dashboard-legend">
                <span>
                  <strong>Número grande:</strong> completamente disponíveis
                </span>
                <span>
                  <strong>?</strong> sem informação
                </span>
              </div>
            </section>

            <section className="card community-snapshot">
              <div className="community-snapshot-metric">
                <strong>{dashboard.memberCount}</strong>
                <span>{dashboard.memberCount === 1 ? "membro" : "membros"}</span>
              </div>
              <div>
                <h2>Comunidade</h2>
                <p className="muted">Pessoas, papéis, convites e configurações em um só lugar.</p>
              </div>
              <div className="actions compact-actions">
                <Link className="button secondary" href={`/app/${slug}/members`}>
                  Ver membros
                </Link>
                {membership.role !== "MEMBER" && (
                  <Link className="button ghost" href={`/app/${slug}/settings`}>
                    Configurar
                  </Link>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
