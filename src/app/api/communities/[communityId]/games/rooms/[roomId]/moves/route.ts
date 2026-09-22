import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameRoomParamsSchema, ticTacToeMoveSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { playTicTacToeMove } from "@/server/services/game-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; roomId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameRoomParamsSchema.safeParse(await params);
    const move = ticTacToeMoveSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !move.success)
      throw new AppError(move.success ? "Sala inválida." : move.error.issues[0].message);
    await enforceRateLimit(`game-move:${ids.data.roomId}:${user.id}`, 120, 10 * 60 * 1000);
    return NextResponse.json({
      room: await playTicTacToeMove(user.id, ids.data.communityId, ids.data.roomId, move.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
