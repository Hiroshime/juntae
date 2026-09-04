import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { costShareStatusSchema } from "@/lib/validation/cost-share";
import { requireAuthenticatedUser } from "@/server/authorization";
import { setCostShareStatus } from "@/server/services/cost-share-service";

type Context = { params: Promise<{ communityId: string; costShareId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, costShareId } = await params;
    const parsed = costShareStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      costShare: await setCostShareStatus(user.id, communityId, costShareId, parsed.data.status),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
