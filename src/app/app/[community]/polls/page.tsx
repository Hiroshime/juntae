import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatPollDeadline, pollStatusLabels, pollTypeLabels } from "@/features/polls/status";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { listPolls } from "@/server/services/poll-service";

export const dynamic = "force-dynamic";

export default async function PollsPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ scope?: string; page?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/polls`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const search = await searchParams;
  const scope = search.scope === "CLOSED" || search.scope === "ALL" ? search.scope : "OPEN";
  const parsedPage = Number(search.page);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageSize = 20;
  const results = await listPolls(user.id, membership.communityId, {
    scope,
    take: pageSize + 1,
    skip: (page - 1) * pageSize,
  });
  const hasNextPage = results.length > pageSize;
  const polls = results.slice(0, pageSize);
  const pageHref = (targetPage: number) => {
    const query = new URLSearchParams();
    if (scope !== "OPEN") query.set("scope", scope);
    if (targetPage > 1) query.set("page", String(targetPage));
    const suffix = query.toString();
    return `/app/${slug}/polls${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Votações</div>
              <h1>Decidir em conjunto</h1>
              <p className="lead">
                Escolha opções, atividades ou as melhores datas em poucos toques.
              </p>
            </div>
            <Link className="button" href={`/app/${slug}/polls/new`}>
              Criar votação
            </Link>
          </div>
          <nav className="event-filters" aria-label="Filtrar votações">
            <Link className={scope === "OPEN" ? "active" : ""} href={`/app/${slug}/polls`}>
              Abertas
            </Link>
            <Link
              className={scope === "CLOSED" ? "active" : ""}
              href={`/app/${slug}/polls?scope=CLOSED`}
            >
              Encerradas
            </Link>
            <Link className={scope === "ALL" ? "active" : ""} href={`/app/${slug}/polls?scope=ALL`}>
              Todas
            </Link>
          </nav>
          {polls.length ? (
            <div className="poll-grid">
              {polls.map((poll) => (
                <Link
                  className="card poll-card"
                  href={`/app/${slug}/polls/${poll.id}`}
                  key={poll.id}
                >
                  <div className="card-header">
                    <span className={`poll-status poll-status-${poll.status.toLowerCase()}`}>
                      {pollStatusLabels[poll.status]}
                    </span>
                    <span className="muted small">{pollTypeLabels[poll.type]}</span>
                  </div>
                  <h2>{poll.title}</h2>
                  {poll.description && (
                    <p className="muted poll-description-preview">{poll.description}</p>
                  )}
                  {poll.leadingOption && poll.totalVoters > 0 && (
                    <p className="poll-leader">
                      Na frente: <strong>{poll.leadingOption.label}</strong> ·{" "}
                      {poll.leadingOption.votes} votos
                    </p>
                  )}
                  <div className="poll-card-footer">
                    <strong>
                      {poll.totalVoters} {poll.totalVoters === 1 ? "votante" : "votantes"}
                    </strong>
                    {poll.myVoteCount > 0 && <span className="pill">Você votou</span>}
                    {poll.closesAt && (
                      <span>
                        {poll.status === "OPEN" ? "Até" : "Prazo"}{" "}
                        {formatPollDeadline(poll.closesAt, user.timezone)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card empty-state">
              <span className="empty-icon">🗳️</span>
              <h2>Nenhuma votação aqui</h2>
              <p className="muted">Crie uma pergunta para a comunidade decidir junta.</p>
              <Link className="button" href={`/app/${slug}/polls/new`}>
                Criar a primeira votação
              </Link>
            </div>
          )}
          {(page > 1 || hasNextPage) && (
            <nav aria-label="Paginação de votações" className="pagination">
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
