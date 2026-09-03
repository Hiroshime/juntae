import { AppHeader } from "@/components/app-header";
import { ProfileForms } from "@/features/profiles/profile-forms";
import { requirePageUser } from "@/lib/auth/page-session";
import { getProfile } from "@/server/services/profile-service";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requirePageUser("/settings/profile");
  const profile = await getProfile(user.id);
  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Sua conta</div>
              <h1>Meu perfil</h1>
              <p className="lead">Gerencie sua identidade, timezone e segurança.</p>
            </div>
          </div>
          <ProfileForms profile={profile} memberships={profile.memberships} />
        </section>
      </div>
    </main>
  );
}
