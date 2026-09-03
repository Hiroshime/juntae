import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { CreateCommunityForm } from "@/features/communities/create-community-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { listUserCommunities } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

const roleLabels = { OWNER: "Owner", ADMIN: "Administrador", MEMBER: "Membro" } as const;

export default async function AppHomePage() {
  const user = await requirePageUser("/app");
  const memberships = await listUserCommunities(user.id);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Suas comunidades</div>
              <h1>Olá, {user.name.split(" ")[0]} 👋</h1>
              <p className="lead">Escolha uma comunidade ou crie um novo espaço para a galera.</p>
            </div>
            <CreateCommunityForm />
          </div>

          <div className="community-grid">
            {memberships.map(({ community, role, displayName }) => (
              <Link
                className="card community-card"
                href={`/app/${community.slug}`}
                key={community.id}
              >
                <div className="card-header">
                  <span className="community-icon">{community.name.charAt(0).toUpperCase()}</span>
                  <span className="role-badge">{roleLabels[role]}</span>
                </div>
                <h2>{community.name}</h2>
                <p className="muted">
                  {community.description ?? "Organize a agenda da sua galera."}
                </p>
                <div className="community-meta">
                  <span>{community._count.members} membros</span>
                  {displayName && <span>como {displayName}</span>}
                </div>
              </Link>
            ))}
          </div>

          {!memberships.length && (
            <div className="card empty-state">
              <span className="empty-icon">👥</span>
              <h2>Crie a primeira comunidade</h2>
              <p className="muted">Ou abra um link de convite enviado por um administrador.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
