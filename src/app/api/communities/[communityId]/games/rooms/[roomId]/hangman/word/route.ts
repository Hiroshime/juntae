import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameRoomParamsSchema, hangmanSecretSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { setHangmanSecret } from "@/server/services/game-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; roomId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameRoomParamsSchema.safeParse(await params);
    const input = hangmanSecretSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      throw new AppError(input.success ? "Sala inválida." : input.error.issues[0].message);
    await enforceRateLimit(`hangman-word:${ids.data.roomId}:${user.id}`, 30, 10 * 60 * 1000);
    return NextResponse.json({
      room: await setHangmanSecret(user.id, ids.data.communityId, ids.data.roomId, input.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
