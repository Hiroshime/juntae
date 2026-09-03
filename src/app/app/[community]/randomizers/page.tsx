import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { RandomizerWorkbench } from "@/features/randomizers/randomizer-workbench";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import {
  getRandomizerSources,
  listSavedRandomizerRuns,
} from "@/server/services/randomizer-service";

export const dynamic = "force-dynamic";

export default async function RandomizersPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/randomizers`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const rawPage = Number((await searchParams).page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 20;
  const [sources, historyResults] = await Promise.all([
    getRandomizerSources(user.id, membership.communityId),
    listSavedRandomizerRuns(user.id, membership.communityId, {
      take: pageSize + 1,
      skip: (page - 1) * pageSize,
    }),
  ]);
  const hasNextPage = historyResults.length > pageSize;
  const savedRuns = historyResults.slice(0, pageSize);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page randomizer-page">
          <div className="page-heading randomizer-heading">
            <div>
              <div className="eyebrow">Geradores</div>
              <h1>Sorteia aí, Galera</h1>
              <p className="lead">
                Monte times, distribua caronas e tarefas ou escolha qualquer coisa com regras claras
                e poucos toques.
              </p>
            </div>
            <span className="randomizer-heading-die" aria-hidden="true">
              🎲
            </span>
          </div>
          <RandomizerWorkbench
            communityId={membership.communityId}
            communitySlug={slug}
            events={sources.events.map((event) => ({
              ...event,
              startsAt: event.startsAt.toISOString(),
            }))}
            members={sources.members}
            savedRuns={savedRuns.map((run) => ({
              ...run,
              createdAt: run.createdAt.toISOString(),
            }))}
          />
          {(page > 1 || hasNextPage) && (
            <nav aria-label="Paginação do histórico de sorteios" className="pagination">
              {page > 1 ? (
                <Link
                  className="button secondary"
                  href={`/app/${slug}/randomizers${page > 2 ? `?page=${page - 1}` : ""}`}
                >
                  ← Anterior
                </Link>
              ) : (
                <span />
              )}
              <span>Página {page}</span>
              {hasNextPage && (
                <Link
                  className="button secondary"
                  href={`/app/${slug}/randomizers?page=${page + 1}`}
                >
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
