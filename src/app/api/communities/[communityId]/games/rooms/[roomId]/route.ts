import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/http/route";
import { gameRoomParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { getGameRoom } from "@/server/services/game-service";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ communityId: string; roomId: string }> },
) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = gameRoomParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Sala inválida.");
    return NextResponse.json({
      room: await getGameRoom(user.id, ids.data.communityId, ids.data.roomId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
