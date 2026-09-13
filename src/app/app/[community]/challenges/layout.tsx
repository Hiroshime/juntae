import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { challengePageContext } from "@/server/challenge-page";

export const dynamic = "force-dynamic";
export default async function ChallengesLayout({
  params,
  children,
}: {
  params: Promise<{ community: string }>;
  children: ReactNode;
}) {
  const { community: slug } = await params;
  const { user, membership } = await challengePageContext(slug);
  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">{children}</section>
      </div>
    </main>
  );
}
