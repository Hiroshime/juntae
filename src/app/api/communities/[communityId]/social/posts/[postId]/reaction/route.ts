import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { socialPostIdsSchema, socialReactionSchema } from "@/lib/validation/social";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { toggleSocialReaction } from "@/server/services/social-service";

type Context = { params: Promise<{ communityId: string; postId: string }> };
export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = socialPostIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Publicação inválida.");
    await enforceRateLimit(`social-reaction:${user.id}`, 120, 10 * 60 * 1000);
    const parsed = socialReactionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    return NextResponse.json(
      await toggleSocialReaction(user.id, ids.data.communityId, ids.data.postId, parsed.data.type),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
