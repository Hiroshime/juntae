import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { challengeActivityIdsSchema } from "@/lib/validation/challenge-activity";
import { challengeModerationSchema } from "@/lib/validation/challenge-moderation";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { moderateChallengeActivity } from "@/server/services/challenge-moderation-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; challengeId: string; activityId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeActivityIdsSchema.safeParse(await params);
    const input = challengeModerationSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success) throw new AppError("Treino inválido.");
    if (!input.success) throw new AppError(input.error.issues[0].message);
    return NextResponse.json(
      await moderateChallengeActivity(
        user.id,
        ids.data.communityId,
        ids.data.challengeId,
        ids.data.activityId,
        input.data,
      ),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
