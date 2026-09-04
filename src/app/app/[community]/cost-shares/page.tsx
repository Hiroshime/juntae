import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CostShareCreateForm } from "@/features/cost-shares/cost-share-create-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getCostShareSources, listCostShares } from "@/server/services/cost-share-service";

export const dynamic = "force-dynamic";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

export default async function CostSharesPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/cost-shares`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const [sources, shares] = await Promise.all([
    getCostShareSources(user.id, membership.communityId),
    listCostShares(user.id, membership.communityId),
  ]);
  const initialEventId = (await searchParams).event;

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Despesas compartilhadas</div>
              <h1>Rateios da comunidade</h1>
              <p className="lead">
                Registre cada compra, mesmo com vários pagadores, e veja o acerto líquido entre as
                pessoas.
              </p>
            </div>
          </div>
          <div className="grid cost-share-layout">
            <CostShareCreateForm
              communityId={membership.communityId}
              communitySlug={slug}
              events={sources.events.map((event) => ({
                ...event,
                startsAt: event.startsAt.toISOString(),
              }))}
              initialEventId={initialEventId}
              members={sources.members}
            />
            <section>
              <div className="card-header">
                <div>
                  <div className="eyebrow">Histórico</div>
                  <h2>Rateios</h2>
                </div>
                <span>{shares.length}</span>
              </div>
              {shares.length ? (
                <div className="cost-share-list">
                  {shares.map((share) => (
                    <Link
                      className="card cost-share-card"
                      href={`/app/${slug}/cost-shares/${share.id}`}
                      key={share.id}
                    >
                      <div>
                        <span
                          className={`status-dot ${share.status === "OPEN" ? "active" : "inactive"}`}
                        >
                          {share.status === "OPEN" ? "Aberto" : "Fechado"}
                        </span>
                        <h3>{share.title}</h3>
                        {share.event && <p className="muted small">Evento: {share.event.title}</p>}
                      </div>
                      <div className="cost-share-card-total">
                        <strong>{money(share.totalCents, share.currency)}</strong>
                        <span>
                          {share.participantCount} pessoas · {share.expenseCount} itens
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="card empty-state compact">
                  <span className="empty-icon">÷</span>
                  <p>Nenhum rateio criado ainda.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
