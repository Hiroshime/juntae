import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { createGameRoomSchema, gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { createGameRoom, listOpenGameRooms } from "@/server/services/game-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    return NextResponse.json({ rooms: await listOpenGameRooms(user.id, ids.data.communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await params);
    const input = createGameRoomSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      throw new AppError(input.success ? "Comunidade inválida." : input.error.issues[0].message);
    await enforceRateLimit(
      `game-room-create:${ids.data.communityId}:${user.id}`,
      10,
      60 * 60 * 1000,
    );
    return NextResponse.json(
      { room: await createGameRoom(user.id, ids.data.communityId, input.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
