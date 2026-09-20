import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SocialFeed } from "@/features/social/social-feed";
import { requirePageUser } from "@/lib/auth/page-session";
import { socialPageSchema } from "@/lib/validation/social";
import { getMembershipBySlug } from "@/server/services/community-service";
import { listSocialPosts } from "@/server/services/social-service";

export const dynamic = "force-dynamic";

export default async function SocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/social`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const page = socialPageSchema.parse((await searchParams).page);
  const feed = await listSocialPosts(user.id, membership.communityId, page);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page social-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Comunicação da comunidade</div>
              <h1>Novidades da turma</h1>
              <p className="lead">
                Compartilhe textos, imagens e vídeos, converse nos comentários e acompanhe os
                comunicados importantes.
              </p>
            </div>
          </div>
          <SocialFeed
            canAnnounce={feed.role !== "MEMBER"}
            communityId={membership.communityId}
            communitySlug={slug}
            hasNext={feed.hasNext}
            items={feed.items}
            page={feed.page}
            timezone={user.timezone}
          />
        </section>
      </div>
    </main>
  );
}
