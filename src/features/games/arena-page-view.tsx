import { ArenaGame, type ArenaSection } from "@/features/games/arena-game";
import { gamePageContext } from "@/server/game-page";
import { getActiveArenaBattle } from "@/server/services/arena-battle-service";
import { getArenaOccupationHub } from "@/server/services/arena-occupation-service";
import { getArenaPvpHub } from "@/server/services/arena-pvp-service";
import { getArenaGladiator, listArenaLeaderboard } from "@/server/services/arena-service";

const SECTION_PATH: Record<ArenaSection, string> = {
  VILLAGE: "/arena",
  EXPEDITIONS: "/arena/expeditions",
  MERCHANTS: "/arena/merchants",
  CAMP: "/arena/camp",
  PVP: "/arena/pvp",
};

export async function ArenaPageView({ section, slug }: { section: ArenaSection; slug: string }) {
  const { user, membership } = await gamePageContext(slug, SECTION_PATH[section]);
  const pvpHub = section === "PVP" ? await getArenaPvpHub(user.id, membership.communityId) : null;
  const occupationHub = await getArenaOccupationHub(user.id, membership.communityId);
  const [gladiator, leaderboard] = await Promise.all([
    getArenaGladiator(user.id, membership.communityId),
    listArenaLeaderboard(user.id, membership.communityId),
  ]);
  const activeBattle = gladiator
    ? await getActiveArenaBattle(user.id, membership.communityId)
    : null;
  return (
    <ArenaGame
      communityId={membership.communityId}
      communitySlug={slug}
      initialBattle={activeBattle}
      initialLeaderboard={leaderboard}
      initialOccupationHub={occupationHub}
      initialProfile={gladiator}
      initialPvpHub={pvpHub}
      initialSection={section}
    />
  );
}
