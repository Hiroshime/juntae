import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { communityAiIdsSchema } from "@/lib/validation/community-ai";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { testCommunityAiConnection } from "@/server/services/community-ai-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = communityAiIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(`ai-test:${ids.data.communityId}:${user.id}`, 5, 10 * 60_000);
    return NextResponse.json(await testCommunityAiConnection(user.id, ids.data.communityId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
