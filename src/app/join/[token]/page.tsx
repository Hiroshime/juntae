import Link from "next/link";
import { JoinActions } from "@/features/communities/join-actions";
import { getSessionUser } from "@/lib/auth/session";
import { getInvitePreview } from "@/server/services/community-service";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getSessionUser();
  try {
    const preview = await getInvitePreview(token, user?.id);
    const next = `/join/${encodeURIComponent(token)}`;
    return (
      <main className="auth-wrap">
        <section className="auth-card card join-card">
          <div className="auth-brand-row">
            <Brand />
            <ThemeSwitcher />
          </div>
          <div className="community-icon large">
            {preview.community.name.charAt(0).toUpperCase()}
          </div>
          <div className="eyebrow">Você foi convidado</div>
          <h1>{preview.community.name}</h1>
          <p className="muted">
            Entre para ver membros, calendário, eventos e votações desta comunidade privada.
          </p>
          {preview.expiresAt && (
            <p className="small muted">
              Convite válido até {preview.expiresAt.toLocaleString("pt-BR")}.
            </p>
          )}
          {user ? (
            <>
              <p>
                Continuar como <strong>{user.name}</strong>.
              </p>
              <JoinActions token={token} />
            </>
          ) : (
            <div className="actions">
              <Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>
                Entrar
              </Link>
              <Link
                className="button secondary"
                href={`/register?invite=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`}
              >
                Criar conta
              </Link>
            </div>
          )}
        </section>
      </main>
    );
  } catch {
    return (
      <main className="auth-wrap">
        <section className="auth-card card">
          <div className="auth-brand-row">
            <Brand />
            <ThemeSwitcher />
          </div>
          <h1>Convite indisponível</h1>
          <p className="muted">
            Este link é inválido, expirou, foi revogado ou atingiu o limite de usos.
          </p>
          <Link className="button" href="/app">
            Ir para minhas comunidades
          </Link>
        </section>
      </main>
    );
  }
}
