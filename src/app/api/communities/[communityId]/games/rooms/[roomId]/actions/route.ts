import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameRoomActionSchema, gameRoomParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { changeGameRoom } from "@/server/services/game-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; roomId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameRoomParamsSchema.safeParse(await params);
    const action = gameRoomActionSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !action.success)
      throw new AppError(action.success ? "Sala inválida." : action.error.issues[0].message);
    await enforceRateLimit(`game-room-action:${ids.data.roomId}:${user.id}`, 120, 10 * 60 * 1000);
    return NextResponse.json({
      room: await changeGameRoom(user.id, ids.data.communityId, ids.data.roomId, action.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
