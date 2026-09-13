import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { challengeActivityIdsSchema } from "@/lib/validation/challenge-activity";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { deleteChallengeActivity } from "@/server/services/challenge-activity-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ communityId: string; challengeId: string; activityId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeActivityIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Treino inválido.");
    await deleteChallengeActivity(
      user.id,
      ids.data.communityId,
      ids.data.challengeId,
      ids.data.activityId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
