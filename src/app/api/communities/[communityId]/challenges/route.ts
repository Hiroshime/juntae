import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { challengeSchema } from "@/lib/validation/challenge";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createChallenge } from "@/server/services/challenge-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = z.object({ communityId: z.uuid() }).safeParse(await params);
    const input = challengeSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !input.success)
      return NextResponse.json(
        { error: !input.success ? input.error.issues[0].message : "Comunidade inválida." },
        { status: 400 },
      );
    return NextResponse.json(
      { challenge: await createChallenge(user.id, ids.data.communityId, input.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
