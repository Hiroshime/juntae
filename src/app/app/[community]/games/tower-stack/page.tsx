import { TowerStackGame } from "@/features/games/tower-stack-game";
import { gamePageContext } from "@/server/game-page";
import { listTowerStackLeaderboards } from "@/server/services/tower-stack-service";

export default async function TowerStackPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const { user, membership } = await gamePageContext(slug, "/tower-stack");
  const leaderboards = await listTowerStackLeaderboards(user.id, membership.communityId);
  return (
    <TowerStackGame
      communityId={membership.communityId}
      communitySlug={slug}
      initialLeaderboards={leaderboards}
    />
  );
}
