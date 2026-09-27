import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { arenaInventoryItemParamsSchema } from "@/lib/validation/arena";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { setArenaItemEquipped } from "@/server/services/arena-service";

type Context = { params: Promise<{ communityId: string; itemId: string }> };

export async function PATCH(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = arenaInventoryItemParamsSchema.safeParse(await routeContext.params);
    if (!ids.success) throw new AppError("Equipamento inválido.");
    await enforceRateLimit(`arena-item-equip:${ids.data.communityId}:${user.id}`, 80, 60 * 60_000);
    return NextResponse.json({
      gladiator: await setArenaItemEquipped(
        user.id,
        ids.data.communityId,
        ids.data.itemId,
        await request.json().catch(() => null),
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
