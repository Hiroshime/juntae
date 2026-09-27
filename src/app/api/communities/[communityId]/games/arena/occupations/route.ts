import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  getArenaOccupationHub,
  startArenaOccupation,
} from "@/server/services/arena-occupation-service";

type Context = { params: Promise<{ communityId: string }> };

async function context(routeContext: Context) {
  const user = await requireAuthenticatedUser();
  const ids = gameCommunityParamsSchema.safeParse(await routeContext.params);
  if (!ids.success) throw new AppError("Comunidade inválida.");
  return { user, communityId: ids.data.communityId };
}

export async function GET(_request: Request, routeContext: Context) {
  try {
    const { user, communityId } = await context(routeContext);
    await enforceRateLimit(`arena-occupations-read:${communityId}:${user.id}`, 180, 60 * 60_000);
    return NextResponse.json({ hub: await getArenaOccupationHub(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, routeContext: Context) {
  try {
    assertSameOrigin(request);
    const { user, communityId } = await context(routeContext);
    await enforceRateLimit(`arena-occupations-start:${communityId}:${user.id}`, 20, 60 * 60_000);
    return NextResponse.json(
      {
        hub: await startArenaOccupation(
          user.id,
          communityId,
          await request.json().catch(() => null),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
