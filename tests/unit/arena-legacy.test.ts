import { describe, expect, it } from "vitest";
import { arenaLegacy } from "@/lib/games/arena-legacy";

describe("legado da Arena", () => {
  it("mantém todas as conquistas bloqueadas no início", () => {
    expect(
      arenaLegacy({ wins: 0, losses: 0, fame: 0, campaignCompletions: 0, inventoryCount: 0 }),
    ).toMatchObject({
      totalBattles: 0,
      winRate: 0,
      unlockedCount: 0,
      badges: expect.arrayContaining([expect.objectContaining({ unlocked: false })]),
    });
  });

  it("deriva conquistas e aproveitamento sem persistir estado duplicado", () => {
    const legacy = arenaLegacy({
      wins: 8,
      losses: 2,
      fame: 50,
      campaignCompletions: 1,
      inventoryCount: 4,
    });
    expect(legacy).toMatchObject({ totalBattles: 10, winRate: 80, unlockedCount: 5 });
    expect(legacy.badges.every((badge) => badge.unlocked)).toBe(true);
  });
});
