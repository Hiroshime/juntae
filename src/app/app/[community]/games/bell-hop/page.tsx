import { BellHopGame } from "@/features/games/bell-hop-game";
import { gamePageContext } from "@/server/game-page";
import { listBellHopLeaderboards } from "@/server/services/bell-hop-service";

export default async function BellHopPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const { user, membership } = await gamePageContext(slug, "/bell-hop");
  const leaderboards = await listBellHopLeaderboards(user.id, membership.communityId);
  return (
    <BellHopGame
      communityId={membership.communityId}
      communitySlug={slug}
      initialLeaderboards={leaderboards}
    />
  );
}
