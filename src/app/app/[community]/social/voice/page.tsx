import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CommunicationTabs } from "@/features/social/communication-tabs";
import { VoiceHub } from "@/features/voice/voice-hub";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { listVoiceChannels } from "@/server/services/voice-service";

export const dynamic = "force-dynamic";

export default async function VoicePage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/social/voice`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const channels = await listVoiceChannels(user.id, membership.communityId);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page voice-page">
          <div className="page-heading voice-page-heading">
            <div>
              <div className="eyebrow">Comunicação da comunidade</div>
              <h1>Salas de voz</h1>
              <p className="lead">
                Converse e compartilhe sua tela ao vivo com a turma, sem sair do Juntaê.
              </p>
            </div>
            <CommunicationTabs community={slug} current="voice" />
          </div>
          <VoiceHub communityId={membership.communityId} initialData={channels} />
        </section>
      </div>
    </main>
  );
}
