import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/avatar";
import { ShareActions } from "@/components/share-actions";
import { EventActions } from "@/features/events/event-actions";
import {
  eventStatusClass,
  eventStatusLabels,
  formatEventDate,
  rsvpStatusLabels,
} from "@/features/events/status";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getEvent } from "@/server/services/event-service";

export const dynamic = "force-dynamic";

function formatCurrency(value: number | string, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value));
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ community: string; eventId: string }>;
}) {
  const { community: slug, eventId } = await params;
  const user = await requirePageUser(`/app/${slug}/events/${eventId}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const event = await getEvent(user.id, membership.communityId, eventId).catch(() => null);
  if (!event) notFound();
  const acceptsRsvp = event.status === "PUBLISHED";

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <Link className="small muted" href={`/app/${slug}/events`}>
            ← Voltar para eventos
          </Link>
          <div className="event-detail-heading">
            <div>
              <span className={`event-status ${eventStatusClass(event.status)}`}>
                {eventStatusLabels[event.status]}
              </span>
              <h1>{event.title}</h1>
              <p className="lead event-date">{formatEventDate(event)}</p>
            </div>
            <EventActions
              acceptsRsvp={acceptsRsvp}
              canManage={event.canManage}
              communityId={membership.communityId}
              communitySlug={slug}
              currentRsvp={event.myRsvp}
              currentAttendanceIsPartial={event.myAttendanceIsPartial}
              initialAttendanceDates={event.myAttendanceDates}
              attendanceDates={event.attendanceDates}
              allowMaybe={event.allowMaybe}
              allowPartialAttendance={event.allowPartialAttendance}
              eventId={event.id}
            />
            <ShareActions
              path={`/app/${slug}/events/${event.id}`}
              text={`📅 ${event.title}\n🗓️ ${formatEventDate(event)}${event.locationName ? `\n📍 ${event.locationName}` : ""}\n👥 ${event.rsvpSummary.GOING} confirmados\n\nConfirme sua presença:`}
              title={event.title}
            />
            <Link className="button secondary" href={`/app/${slug}/cost-shares?event=${event.id}`}>
              Criar rateio
            </Link>
          </div>
          {event.status === "CANCELLED" && (
            <div className="error event-notice">
              Este evento foi cancelado. As informações e respostas foram preservadas.
            </div>
          )}
          <div className="grid event-detail-grid">
            <section className="card event-info">
              <h2>Detalhes</h2>
              {event.description && <p className="event-description">{event.description}</p>}
              <dl>
                <div>
                  <dt>Data</dt>
                  <dd>{formatEventDate(event)}</dd>
                </div>
                {event.locationName && (
                  <div>
                    <dt>Local</dt>
                    <dd>{event.locationName}</dd>
                  </div>
                )}
                {event.locationAddress && (
                  <div>
                    <dt>Endereço</dt>
                    <dd>{event.locationAddress}</dd>
                  </div>
                )}
                {event.locationUrl && (
                  <div>
                    <dt>Link</dt>
                    <dd>
                      <a href={event.locationUrl} rel="noreferrer" target="_blank">
                        Abrir local ↗
                      </a>
                    </dd>
                  </div>
                )}
                {event.estimatedCost && (
                  <>
                    <div>
                      <dt>Custo estimado</dt>
                      <dd>{formatCurrency(event.estimatedCost, event.currency)}</dd>
                    </div>
                    <div>
                      <dt>Por pessoa confirmada</dt>
                      <dd>
                        {event.estimatedCostPerConfirmed == null
                          ? "Aguardando confirmações"
                          : formatCurrency(event.estimatedCostPerConfirmed, event.currency)}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Criado por</dt>
                  <dd>{event.createdBy.name}</dd>
                </div>
                <div>
                  <dt>Respostas</dt>
                  <dd>
                    Vou{event.allowMaybe ? ", Talvez" : ""} e Não vou
                    {event.allowPartialAttendance && event.attendanceDates.length > 1
                      ? " · dias específicos permitidos"
                      : ""}
                  </dd>
                </div>
              </dl>
            </section>
            <aside className="card attendance-card">
              <div className="card-header">
                <h2>Participação</h2>
                <strong>{event.rsvpSummary.totalResponses} respostas</strong>
              </div>
              <div className="attendance-metrics">
                <div>
                  <strong>{event.rsvpSummary.GOING}</strong>
                  <span>vão</span>
                </div>
                <div>
                  <strong>{event.rsvpSummary.MAYBE}</strong>
                  <span>talvez</span>
                </div>
                <div>
                  <strong>{event.rsvpSummary.NOT_GOING}</strong>
                  <span>não vão</span>
                </div>
              </div>
              {event.participantLimit && (
                <div className={`capacity ${event.limitReached ? "capacity-full" : ""}`}>
                  <strong>
                    {event.remainingSpots}{" "}
                    {event.remainingSpots === 1 ? "vaga restante" : "vagas restantes"}
                  </strong>
                  <span>Limite informado: {event.participantLimit}</span>
                  {event.limitReached && (
                    <small>O limite é informativo; respostas “Vou” continuam permitidas.</small>
                  )}
                </div>
              )}
            </aside>
          </div>
          <section className="participants-section">
            <div className="card-header">
              <div>
                <div className="eyebrow">Participantes</div>
                <h2>Respostas da comunidade</h2>
              </div>
            </div>
            {event.participants.length ? (
              <div className="participant-groups">
                {(["GOING", "MAYBE", "NOT_GOING"] as const).map((status) => {
                  const participants = event.participants.filter(
                    (person) => person.status === status,
                  );
                  return (
                    <section className="card participant-group" key={status}>
                      <h3>
                        {rsvpStatusLabels[status]} <span>{participants.length}</span>
                      </h3>
                      <div className="participant-list">
                        {participants.map((person) => (
                          <div className="participant" key={person.userId}>
                            <Avatar name={person.name} url={person.avatarUrl} size="small" />
                            <span>
                              {person.name}
                              {person.attendingSpecificDays && (
                                <small>
                                  {person.attendanceDates
                                    .map((date) =>
                                      new Intl.DateTimeFormat("pt-BR", {
                                        day: "2-digit",
                                        month: "short",
                                        timeZone: "UTC",
                                      }).format(new Date(`${date}T00:00:00Z`)),
                                    )
                                    .join(", ")}
                                </small>
                              )}
                            </span>
                          </div>
                        ))}
                        {!participants.length && <p className="muted small">Ninguém ainda.</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="card empty-state compact">
                <p className="muted">Ainda não há respostas para este evento.</p>
              </div>
            )}
          </section>
          {event.costShares.length > 0 && (
            <section className="participants-section">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Despesas</div>
                  <h2>Rateios deste evento</h2>
                </div>
              </div>
              <div className="cost-share-list">
                {event.costShares.map((share) => (
                  <Link
                    className="card cost-share-card"
                    href={`/app/${slug}/cost-shares/${share.id}`}
                    key={share.id}
                  >
                    <h3>{share.title}</h3>
                    <span
                      className={`status-dot ${share.status === "OPEN" ? "active" : "inactive"}`}
                    >
                      {share.status === "OPEN" ? "Aberto" : "Fechado"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
