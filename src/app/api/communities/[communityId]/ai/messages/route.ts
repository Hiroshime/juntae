import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { communityAiIdsSchema, communityAiMessageSchema } from "@/lib/validation/community-ai";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { sendCommunityAiMessage } from "@/server/services/community-ai-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = communityAiIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const input = communityAiMessageSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new AppError(input.error.issues[0].message);
    await Promise.all([
      enforceRateLimit(`ai-message:user:${ids.data.communityId}:${user.id}`, 12, 10 * 60_000),
      enforceRateLimit(`ai-message:community:${ids.data.communityId}`, 80, 60 * 60_000),
    ]);
    return NextResponse.json(
      await sendCommunityAiMessage(user.id, ids.data.communityId, input.data),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
