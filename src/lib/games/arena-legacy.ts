export const ARENA_LEGACY_BADGES = [
  {
    key: "FIRST_VICTORY",
    name: "Primeiro clamor",
    description: "Conquiste a primeira vitória na arena.",
    icon: "⚔",
  },
  {
    key: "CAMPAIGN_CHAMPION",
    name: "Campeão do Sol",
    description: "Conclua uma campanha derrotando Aurélia.",
    icon: "♛",
  },
  {
    key: "VETERAN",
    name: "Veterano da areia",
    description: "Complete dez duelos.",
    icon: "◈",
  },
  {
    key: "COLLECTOR",
    name: "Arsenal da Vila",
    description: "Adquira ao menos quatro equipamentos.",
    icon: "⬟",
  },
  {
    key: "CROWD_FAVOURITE",
    name: "Favorito das arquibancadas",
    description: "Alcance 50 pontos de fama.",
    icon: "★",
  },
] as const;

export type ArenaLegacyInput = {
  wins: number;
  losses: number;
  fame: number;
  campaignCompletions: number;
  inventoryCount: number;
};

export function arenaLegacy(input: ArenaLegacyInput) {
  const totalBattles = Math.max(0, input.wins + input.losses);
  const unlocked = new Set<string>();
  if (input.wins >= 1) unlocked.add("FIRST_VICTORY");
  if (input.campaignCompletions >= 1) unlocked.add("CAMPAIGN_CHAMPION");
  if (totalBattles >= 10) unlocked.add("VETERAN");
  if (input.inventoryCount >= 4) unlocked.add("COLLECTOR");
  if (input.fame >= 50) unlocked.add("CROWD_FAVOURITE");
  return {
    totalBattles,
    winRate: totalBattles ? Math.round((input.wins / totalBattles) * 100) : 0,
    unlockedCount: unlocked.size,
    badges: ARENA_LEGACY_BADGES.map((badge) => ({
      ...badge,
      unlocked: unlocked.has(badge.key),
    })),
  };
}
