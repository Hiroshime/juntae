import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CommunityFundManager } from "@/features/community-fund/community-fund-manager";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getCommunityFund } from "@/server/services/community-fund-service";

export const dynamic = "force-dynamic";

export default async function CommunityFundPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/fund`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const fund = await getCommunityFund(user.id, membership.communityId);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Caixa compartilhado</div>
              <h1>Fundão da comunidade</h1>
              <p className="lead">
                Guarde contribuições mensais, acompanhe seu crédito e use o saldo nos próximos
                passeios.
              </p>
            </div>
          </div>
          <CommunityFundManager communityId={membership.communityId} initialData={fund} />
        </section>
      </div>
    </main>
  );
}
