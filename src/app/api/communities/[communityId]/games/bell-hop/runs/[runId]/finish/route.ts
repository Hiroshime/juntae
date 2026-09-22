import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { bellHopRunParamsSchema, finishBellHopRunSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { finishBellHopRun, listBellHopLeaderboards } from "@/server/services/bell-hop-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; runId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = bellHopRunParamsSchema.safeParse(await params);
    const input = finishBellHopRunSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      throw new AppError(input.success ? "Partida inválida." : input.error.issues[0].message);
    await enforceRateLimit(
      `bell-hop-finish:${ids.data.communityId}:${user.id}`,
      80,
      60 * 60 * 1_000,
    );
    const run = await finishBellHopRun(user.id, ids.data.communityId, ids.data.runId, input.data);
    return NextResponse.json({
      run,
      leaderboards: await listBellHopLeaderboards(user.id, ids.data.communityId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
