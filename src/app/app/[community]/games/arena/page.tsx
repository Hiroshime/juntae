import { ArenaGame } from "@/features/games/arena-game";
import { gamePageContext } from "@/server/game-page";
import { getArenaGladiator } from "@/server/services/arena-service";

export default async function ArenaPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const { user, membership } = await gamePageContext(slug, "/arena");
  const gladiator = await getArenaGladiator(user.id, membership.communityId);
  return (
    <ArenaGame
      communityId={membership.communityId}
      communitySlug={slug}
      initialProfile={gladiator}
    />
  );
}
