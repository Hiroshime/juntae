import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { purchaseArenaItem } from "@/server/services/arena-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `arena-item-purchase:${ids.data.communityId}:${user.id}`,
      40,
      60 * 60_000,
    );
    return NextResponse.json({
      gladiator: await purchaseArenaItem(
        user.id,
        ids.data.communityId,
        await request.json().catch(() => null),
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
