import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CommunitySettingsForms } from "@/features/communities/community-settings-forms";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug, listInvites } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export default async function CommunitySettingsPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/settings`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership || membership.role === "MEMBER") notFound();
  const invites = await listInvites(user.id, membership.communityId);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Administração</div>
              <h1>Configurações</h1>
              <p className="lead">Atualize a comunidade e gere convites seguros.</p>
            </div>
          </div>
          <CommunitySettingsForms community={membership.community} invites={invites} />
        </section>
      </div>
    </main>
  );
}
