import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { eventStatusClass, eventStatusLabels, formatEventDate } from "@/features/events/status";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { listEvents } from "@/server/services/event-service";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ scope?: string; page?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/events`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const search = await searchParams;
  const scope = search.scope === "PAST" || search.scope === "ALL" ? search.scope : "UPCOMING";
  const parsedPage = Number(search.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 20;
  const results = await listEvents(user.id, membership.communityId, {
    scope,
    take: pageSize + 1,
    skip: (page - 1) * pageSize,
  });
  const hasNextPage = results.length > pageSize;
  const events = results.slice(0, pageSize);
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (scope !== "UPCOMING") query.set("scope", scope);
    if (targetPage > 1) query.set("page", String(targetPage));
    const suffix = query.toString();
    return `/app/${slug}/events${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Eventos</div>
              <h1>Planos do grupo</h1>
              <p className="lead">Crie encontros e acompanhe quem vai, talvez vá ou não vai.</p>
            </div>
            <Link className="button" href={`/app/${slug}/events/new`}>
              Criar evento
            </Link>
          </div>
          <nav className="event-filters" aria-label="Filtrar eventos">
            <Link className={scope === "UPCOMING" ? "active" : ""} href={`/app/${slug}/events`}>
              Próximos
            </Link>
            <Link
              className={scope === "PAST" ? "active" : ""}
              href={`/app/${slug}/events?scope=PAST`}
            >
              Passados
            </Link>
            <Link
              className={scope === "ALL" ? "active" : ""}
              href={`/app/${slug}/events?scope=ALL`}
            >
              Todos
            </Link>
          </nav>
          {events.length ? (
            <div className="event-grid">
              {events.map((event) => (
                <Link
                  className="card event-card"
                  href={`/app/${slug}/events/${event.id}`}
                  key={event.id}
                >
                  <div className="card-header">
                    <span className={`event-status ${eventStatusClass(event.status)}`}>
                      {eventStatusLabels[event.status]}
                    </span>
                    {event.myRsvp && <span className="pill">Sua resposta registrada</span>}
                  </div>
                  <h2>{event.title}</h2>
                  <p className="event-date">{formatEventDate(event)}</p>
                  {event.locationName && <p className="muted">📍 {event.locationName}</p>}
                  <div className="event-counts">
                    <strong>{event.rsvpSummary.GOING} vão</strong>
                    <span>{event.rsvpSummary.MAYBE} talvez</span>
                    {event.participantLimit && <span>limite {event.participantLimit}</span>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card empty-state">
              <span className="empty-icon">📅</span>
              <h2>Nenhum evento neste período</h2>
              <p className="muted">Que tal transformar a próxima boa data em um encontro?</p>
              <Link className="button" href={`/app/${slug}/events/new`}>
                Criar o primeiro evento
              </Link>
            </div>
          )}
          {(page > 1 || hasNextPage) && (
            <nav aria-label="Paginação de eventos" className="pagination">
              {page > 1 ? (
                <Link className="button secondary" href={pageHref(page - 1)}>
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span>Página {page}</span>
              {hasNextPage && (
                <Link className="button secondary" href={pageHref(page + 1)}>
                  Próxima →
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
