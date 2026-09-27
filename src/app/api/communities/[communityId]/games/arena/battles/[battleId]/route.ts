import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { arenaBattleParamsSchema } from "@/lib/validation/arena";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { abandonArenaBattle } from "@/server/services/arena-battle-service";

type Context = { params: Promise<{ communityId: string; battleId: string }> };

export async function DELETE(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = arenaBattleParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Duelo inválido.");
    await enforceRateLimit(`arena-battle-abandon:${ids.data.battleId}:${user.id}`, 10, 60 * 60_000);
    return NextResponse.json({
      battle: await abandonArenaBattle(user.id, ids.data.communityId, ids.data.battleId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
