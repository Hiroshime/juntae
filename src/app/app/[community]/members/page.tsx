import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { MemberManagement } from "@/features/communities/member-management";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug, listCommunityMembers } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/members`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const members = await listCommunityMembers(user.id, membership.communityId);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Comunidade</div>
              <h1>Membros</h1>
              <p className="lead">Veja quem participa e gerencie papéis com segurança.</p>
            </div>
          </div>
          <MemberManagement
            communityId={membership.communityId}
            currentUserId={user.id}
            currentRole={membership.role}
            members={members}
          />
        </section>
      </div>
    </main>
  );
}
