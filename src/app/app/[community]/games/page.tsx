import { GameHub } from "@/features/games/game-hub";
import { gamePageContext } from "@/server/game-page";
import { listGameHub } from "@/server/services/game-service";

export default async function GamesPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const { user, membership } = await gamePageContext(slug);
  const hub = await listGameHub(user.id, membership.communityId);
  return <GameHub communityId={membership.communityId} communitySlug={slug} initialHub={hub} />;
}
