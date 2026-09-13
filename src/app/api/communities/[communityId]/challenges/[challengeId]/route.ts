import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import {
  challengeActionSchema,
  challengeIdsSchema,
  challengeSchema,
} from "@/lib/validation/challenge";
import { requireAuthenticatedUser } from "@/server/authorization";
import { changeChallengeParticipation, updateChallenge } from "@/server/services/challenge-service";

type Context = { params: Promise<{ communityId: string; challengeId: string }> };
export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeIdsSchema.safeParse(await params);
    const input = challengeSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      return NextResponse.json(
        { error: !input.success ? input.error.issues[0].message : "Desafio inválido." },
        { status: 400 },
      );
    return NextResponse.json({
      challenge: await updateChallenge(
        user.id,
        ids.data.communityId,
        ids.data.challengeId,
        input.data,
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeIdsSchema.safeParse(await params);
    const input = challengeActionSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      return NextResponse.json({ error: "Ação ou desafio inválido." }, { status: 400 });
    return NextResponse.json({
      challenge: await changeChallengeParticipation(
        user.id,
        ids.data.communityId,
        ids.data.challengeId,
        input.data.action,
      ),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
