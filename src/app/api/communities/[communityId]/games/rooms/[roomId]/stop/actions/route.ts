import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameRoomParamsSchema, stopGameActionSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { getGameRoom } from "@/server/services/game-service";
import { changeStopGame } from "@/server/services/stop-game-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; roomId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameRoomParamsSchema.safeParse(await params);
    const action = stopGameActionSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !action.success)
      throw new AppError(action.success ? "Sala inválida." : action.error.issues[0].message);
    await enforceRateLimit(`stop-action:${ids.data.roomId}:${user.id}`, 180, 10 * 60 * 1_000);
    await changeStopGame(user.id, ids.data.communityId, ids.data.roomId, action.data);
    return NextResponse.json({
      room: await getGameRoom(user.id, ids.data.communityId, ids.data.roomId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
