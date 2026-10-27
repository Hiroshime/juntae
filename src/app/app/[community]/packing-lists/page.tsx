import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { PackingListForm } from "@/features/packing-lists/list-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getPackingListSources, listPackingLists } from "@/server/services/packing-list-service";

export const dynamic = "force-dynamic";

export default async function PackingListsPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ event?: string; page?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/packing-lists`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const query = await searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .catch(1)
    .parse(query.page || 1);
  const eventId = z.string().uuid().safeParse(query.event);
  const [sources, result] = await Promise.all([
    getPackingListSources(
      user.id,
      membership.communityId,
      eventId.success ? eventId.data : undefined,
    ),
    listPackingLists(
      user.id,
      membership.communityId,
      page,
      eventId.success ? eventId.data : undefined,
    ),
  ]);
  const filterEvent = sources.events.find((event) => event.id === query.event);
  const pageHref = (value: number) =>
    `/app/${slug}/packing-lists?page=${value}${eventId.success ? `&event=${eventId.data}` : ""}`;
  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Quem leva o quê?</div>
              <h1>Listas da comunidade</h1>
              <p className="lead">
                Combine comidas, bebidas, equipamentos e o que mais precisar para o encontro.
              </p>
            </div>
          </div>
          {eventId.success && (
            <p>
              Listas {filterEvent ? `de ${filterEvent.title}` : "deste evento"} ·{" "}
              <Link href={`/app/${slug}/packing-lists`}>Ver todas</Link>
            </p>
          )}
          <div className="grid packing-layout">
            <section className="card packing-add">
              <h2>Nova lista</h2>
              <p className="muted small">Crie uma lista independente ou vincule a um evento.</p>
              <PackingListForm
                communityId={membership.communityId}
                communitySlug={slug}
                events={sources.events}
                initialEventId={filterEvent?.id}
              />
            </section>
            <section>
              <div className="card-header">
                <h2>Listas</h2>
                <span>{result.count}</span>
              </div>
              <div className="packing-list-cards">
                {result.lists.map((list) => (
                  <Link
                    className="card cost-share-card"
                    key={list.id}
                    href={`/app/${slug}/packing-lists/${list.id}`}
                  >
                    <div>
                      <h3>{list.title}</h3>
                      {list.event && <p className="small muted">Evento: {list.event.title}</p>}
                      <p className="small">{list._count.items} itens</p>
                    </div>
                    <span className={`status-dot ${list.closed ? "inactive" : "active"}`}>
                      {list.closed ? "Fechada" : "Aberta"}
                    </span>
                  </Link>
                ))}
              </div>
              {!result.lists.length && (
                <div className="card empty-state compact">
                  <p>Nenhuma lista por aqui ainda.</p>
                  <p className="muted small">Que tal organizar o próximo café da manhã?</p>
                </div>
              )}
              <nav className="packing-actions" aria-label="Paginação das listas">
                {page > 1 && (
                  <Link className="button secondary" href={pageHref(page - 1)}>
                    Anterior
                  </Link>
                )}
                {page * 20 < result.count && (
                  <Link className="button secondary" href={pageHref(page + 1)}>
                    Próxima
                  </Link>
                )}
              </nav>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
