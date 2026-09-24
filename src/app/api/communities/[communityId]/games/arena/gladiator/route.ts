import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { gameCommunityParamsSchema } from "@/lib/validation/games";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { createArenaGladiator, updateArenaGladiator } from "@/server/services/arena-service";

type Context = { params: Promise<{ communityId: string }> };

async function context(request: Request, routeContext: Context, action: string) {
  assertSameOrigin(request);
  const user = await requireAuthenticatedUser();
  const ids = gameCommunityParamsSchema.safeParse(await routeContext.params);
  if (!ids.success) throw new AppError("Comunidade inválida.");
  await enforceRateLimit(
    `arena-gladiator-${action}:${ids.data.communityId}:${user.id}`,
    20,
    60 * 60 * 1_000,
  );
  return { user, communityId: ids.data.communityId };
}

export async function POST(request: Request, routeContext: Context) {
  try {
    const { user, communityId } = await context(request, routeContext, "create");
    const input = await request.json().catch(() => null);
    return NextResponse.json(
      { gladiator: await createArenaGladiator(user.id, communityId, input) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, routeContext: Context) {
  try {
    const { user, communityId } = await context(request, routeContext, "update");
    const input = await request.json().catch(() => null);
    return NextResponse.json({
      gladiator: await updateArenaGladiator(user.id, communityId, input),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
