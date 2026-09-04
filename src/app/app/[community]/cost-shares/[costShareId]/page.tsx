import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CostShareManager } from "@/features/cost-shares/cost-share-manager";
import { requirePageUser } from "@/lib/auth/page-session";
import { civilDateInTimeZone } from "@/lib/dates/civil-date";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getCostShare, getCostShareSources } from "@/server/services/cost-share-service";

export const dynamic = "force-dynamic";

export default async function CostSharePage({
  params,
}: {
  params: Promise<{ community: string; costShareId: string }>;
}) {
  const { community: slug, costShareId } = await params;
  const user = await requirePageUser(`/app/${slug}/cost-shares/${costShareId}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const [costShare, sources] = await Promise.all([
    getCostShare(user.id, membership.communityId, costShareId).catch(() => null),
    getCostShareSources(user.id, membership.communityId),
  ]);
  if (!costShare) notFound();

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <Link className="small muted" href={`/app/${slug}/cost-shares`}>
            ← Voltar para rateios
          </Link>
          <div className="page-heading cost-share-heading">
            <div>
              <div className="eyebrow">
                Rateio {costShare.status === "OPEN" ? "aberto" : "fechado"}
              </div>
              <h1>{costShare.title}</h1>
              {costShare.description && <p className="lead">{costShare.description}</p>}
              {costShare.event && (
                <Link className="small" href={`/app/${slug}/events/${costShare.event.id}`}>
                  Evento: {costShare.event.title} →
                </Link>
              )}
            </div>
          </div>
          <CostShareManager
            allMembers={sources.members}
            communityId={membership.communityId}
            costShare={costShare}
            currentUserId={user.id}
            today={civilDateInTimeZone(new Date(), user.timezone)}
          />
        </section>
      </div>
    </main>
  );
}
