import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { challengeIdsSchema } from "@/lib/validation/challenge";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { finalizeChallenge } from "@/server/services/challenge-moderation-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string; challengeId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Desafio inválido.");
    return NextResponse.json(
      await finalizeChallenge(user.id, ids.data.communityId, ids.data.challengeId),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
