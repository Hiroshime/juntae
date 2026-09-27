import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { listArenaLeaderboard } from "@/server/services/arena-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, routeContext: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `arena-leaderboard:${ids.data.communityId}:${user.id}`,
      120,
      60 * 60_000,
    );
    return NextResponse.json({
      leaderboard: await listArenaLeaderboard(user.id, ids.data.communityId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
