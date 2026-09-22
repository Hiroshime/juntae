import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { startTowerStackRun } from "@/server/services/tower-stack-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = gameCommunityParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `tower-stack-start:${ids.data.communityId}:${user.id}`,
      40,
      60 * 60 * 1_000,
    );
    return NextResponse.json(
      { run: await startTowerStackRun(user.id, ids.data.communityId) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
