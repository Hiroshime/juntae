import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { ShareActions } from "@/components/share-actions";
import { PackingListManager } from "@/features/packing-lists/list-manager";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getPackingList, getPackingListSources } from "@/server/services/packing-list-service";
import { AppError } from "@/server/errors";

export const dynamic = "force-dynamic";

export default async function PackingListPage({
  params,
}: {
  params: Promise<{ community: string; listId: string }>;
}) {
  const { community: slug, listId } = await params;
  if (!z.string().uuid().safeParse(listId).success) notFound();
  const user = await requirePageUser(`/app/${slug}/packing-lists/${listId}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const [list, sources] = await Promise.all([
    getPackingList(user.id, membership.communityId, listId).catch((error: unknown) => {
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    }),
    getPackingListSources(user.id, membership.communityId),
  ]);
  const events =
    list.event && !sources.events.some((event) => event.id === list.eventId)
      ? [list.event, ...sources.events]
      : sources.events;
  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <Link className="small muted" href={`/app/${slug}/packing-lists`}>
            ← Voltar para listas
          </Link>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                Quem leva o quê? · Lista {list.closed ? "fechada" : "aberta"}
              </div>
              <h1>{list.title}</h1>
              {list.description && <p className="lead packing-note">{list.description}</p>}
              {list.event && (
                <Link href={`/app/${slug}/events/${list.event.id}`}>
                  Evento: {list.event.title} →
                </Link>
              )}
            </div>
            <ShareActions
              title={list.title}
              text={`🧺 ${list.title}\nCombine com a turma o que cada um vai levar:`}
              path={`/app/${slug}/packing-lists/${list.id}`}
            />
          </div>
          <PackingListManager
            list={list}
            communityId={membership.communityId}
            communitySlug={slug}
            currentUserId={user.id}
            members={sources.members}
            events={events}
          />
        </section>
      </div>
    </main>
  );
}
