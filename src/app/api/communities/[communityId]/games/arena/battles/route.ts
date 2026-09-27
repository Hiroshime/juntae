import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { startArenaBattle } from "@/server/services/arena-battle-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `arena-battle-start:${ids.data.communityId}:${user.id}`,
      20,
      60 * 60_000,
    );
    return NextResponse.json(
      {
        battle: await startArenaBattle(
          user.id,
          ids.data.communityId,
          await request.json().catch(() => null),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
