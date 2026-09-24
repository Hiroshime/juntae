import Link from "next/link";
import { AuthLayout } from "@/features/auth/auth-layout";
import { RegisterForm } from "@/features/auth/register-form";
import { isInitialRegistrationAvailable } from "@/server/services/auth-service";
import { getInvitePreview } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const inviteToken = singleValue(params.invite);

  if (inviteToken) {
    try {
      const preview = await getInvitePreview(inviteToken);
      return (
        <AuthLayout>
          <div className="eyebrow">Cadastro por convite</div>
          <h1>Crie sua conta</h1>
          <p className="muted">
            Seu convite também adicionará você à comunidade{" "}
            <strong>{preview.community.name}</strong>.
          </p>
          <RegisterForm mode="invite" inviteToken={inviteToken} />
          <LoginLink next={`/join/${encodeURIComponent(inviteToken)}`} />
        </AuthLayout>
      );
    } catch {
      return (
        <AuthLayout>
          <h1>Convite indisponível</h1>
          <p className="muted">
            Este link é inválido, expirou, foi revogado ou atingiu o limite de usos.
          </p>
          <Link className="button" href="/login">
            Entrar em uma conta existente
          </Link>
        </AuthLayout>
      );
    }
  }

  if (await isInitialRegistrationAvailable()) {
    return (
      <AuthLayout>
        <div className="eyebrow">Configuração inicial</div>
        <h1>Crie a primeira conta</h1>
        <p className="muted">
          Use o código inicial configurado pelo responsável desta instalação. Depois disso, novos
          cadastros dependerão de convite.
        </p>
        <RegisterForm mode="bootstrap" />
        <LoginLink />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="eyebrow">Comunidade privada</div>
      <h1>Cadastro somente por convite</h1>
      <p className="muted">
        Peça a um administrador de comunidade um link de convite. Se você já possui uma conta, entre
        normalmente.
      </p>
      <Link className="button" href="/login">
        Entrar
      </Link>
    </AuthLayout>
  );
}

function LoginLink({ next }: { next?: string }) {
  const href = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return (
    <p className="muted small">
      Já possui uma conta?{" "}
      <Link href={href} style={{ color: "var(--primary)", fontWeight: 700 }}>
        Entrar
      </Link>
    </p>
  );
}
