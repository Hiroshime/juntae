import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { gamePageContext } from "@/server/game-page";

export const dynamic = "force-dynamic";

export default async function GamesLayout({
  params,
  children,
}: {
  params: Promise<{ community: string }>;
  children: ReactNode;
}) {
  const { community: slug } = await params;
  const { user, membership } = await gamePageContext(slug);
  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page games-page">{children}</section>
      </div>
    </main>
  );
}
