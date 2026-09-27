import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { arenaBattleParamsSchema } from "@/lib/validation/arena";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { playArenaBattleAction } from "@/server/services/arena-battle-service";

type Context = { params: Promise<{ communityId: string; battleId: string }> };

export async function POST(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = arenaBattleParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Duelo inválido.");
    await enforceRateLimit(`arena-battle-action:${ids.data.battleId}:${user.id}`, 120, 60 * 60_000);
    return NextResponse.json({
      battle: await playArenaBattleAction(
        user.id,
        ids.data.communityId,
        ids.data.battleId,
        await request.json().catch(() => null),
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
