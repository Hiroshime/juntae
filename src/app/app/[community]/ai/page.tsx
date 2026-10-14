import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CommunityAiChat } from "@/features/community-ai/community-ai-chat";
import { requirePageUser } from "@/lib/auth/page-session";
import { getCommunityAiWorkspace } from "@/server/services/community-ai-service";
import { getMembershipBySlug } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export default async function CommunityAiPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/ai`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const workspace = await getCommunityAiWorkspace(user.id, membership.communityId);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page community-ai-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Assistente contextual · Beta</div>
              <h1>{workspace.assistant.name}</h1>
              <p className="lead">
                Pergunte sobre os próximos encontros, melhores datas, votações, comunicados e
                desafios da comunidade.
              </p>
            </div>
            {workspace.canManage && (
              <Link className="button secondary" href={`/app/${slug}/settings`}>
                Configurar IA
              </Link>
            )}
          </div>

          {!workspace.assistant.enabled ? (
            <div className="card empty-state">
              <span className="empty-icon" aria-hidden="true">
                ✦
              </span>
              <h2>A IA está desativada nesta comunidade</h2>
              <p className="muted">
                Um owner ou administrador pode escolher o modelo e as fontes de contexto antes de
                liberar o assistente.
              </p>
              {workspace.canManage && (
                <Link className="button" href={`/app/${slug}/settings`}>
                  Abrir configurações
                </Link>
              )}
            </div>
          ) : !workspace.serviceConfigured ? (
            <div className="card empty-state">
              <span className="empty-icon" aria-hidden="true">
                ⚙
              </span>
              <h2>Servidor de IA ainda não conectado</h2>
              <p className="muted">
                A comunidade já habilitou o assistente, mas a instalação precisa receber a variável
                OLLAMA_BASE_URL.
              </p>
            </div>
          ) : (
            <CommunityAiChat
              assistantName={workspace.assistant.name}
              communityId={membership.communityId}
              conversations={workspace.conversations}
              model={workspace.assistant.model}
            />
          )}

          <p className="ai-disclaimer">
            A IA pode cometer erros. Confirme informações importantes nas páginas originais do
            Juntaê. Cada conversa é privada para sua conta, mas as perguntas são processadas pelo
            Ollama da instalação.
          </p>
        </section>
      </div>
    </main>
  );
}
