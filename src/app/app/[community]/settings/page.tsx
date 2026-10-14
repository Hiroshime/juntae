import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CommunitySettingsForms } from "@/features/communities/community-settings-forms";
import { CommunityAiSettingsForm } from "@/features/communities/community-ai-settings-form";
import { CommunityEmailSettingsForm } from "@/features/communities/community-email-settings-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug, listInvites } from "@/server/services/community-service";
import { getCommunityAiSettings } from "@/server/services/community-ai-service";
import { getCommunityEmailSettings } from "@/server/services/email-settings-service";

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
  const [invites, email, ai] = await Promise.all([
    listInvites(user.id, membership.communityId),
    membership.role === "OWNER"
      ? getCommunityEmailSettings(user.id, membership.communityId)
      : Promise.resolve(null),
    getCommunityAiSettings(user.id, membership.communityId),
  ]);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Administração</div>
              <h1>Configurações</h1>
              <p className="lead">
                Atualize a comunidade, gere convites e configure os serviços opcionais.
              </p>
            </div>
          </div>
          <CommunitySettingsForms community={membership.community} invites={invites} />
          <div className="settings-secondary-section">
            <CommunityAiSettingsForm
              communityId={membership.communityId}
              serviceConfigured={ai.serviceConfigured}
              settings={ai.settings}
            />
            {email ? (
              <CommunityEmailSettingsForm
                communityId={membership.communityId}
                deliveries={email.deliveries}
                encryptionStatus={email.encryptionStatus}
                settings={email.settings}
                testRecipient={email.testRecipient}
              />
            ) : (
              <section className="card">
                <h2>E-mail da comunidade</h2>
                <p className="muted">
                  Somente owners podem cadastrar ou substituir credenciais SMTP.
                </p>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
