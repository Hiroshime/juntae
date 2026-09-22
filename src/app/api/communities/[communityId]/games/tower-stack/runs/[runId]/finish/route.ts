import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { finishTowerStackRunSchema, towerStackRunParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  finishTowerStackRun,
  listTowerStackLeaderboards,
} from "@/server/services/tower-stack-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; runId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = towerStackRunParamsSchema.safeParse(await params);
    const input = finishTowerStackRunSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      throw new AppError(input.success ? "Partida inválida." : input.error.issues[0].message);
    await enforceRateLimit(
      `tower-stack-finish:${ids.data.communityId}:${user.id}`,
      80,
      60 * 60 * 1_000,
    );
    const run = await finishTowerStackRun(
      user.id,
      ids.data.communityId,
      ids.data.runId,
      input.data,
    );
    return NextResponse.json({
      run,
      leaderboards: await listTowerStackLeaderboards(user.id, ids.data.communityId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
