import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { updateCostShareSchema } from "@/lib/validation/cost-share";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getCostShare, updateCostShare } from "@/server/services/cost-share-service";

type Context = { params: Promise<{ communityId: string; costShareId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId, costShareId } = await params;
    return NextResponse.json({ costShare: await getCostShare(user.id, communityId, costShareId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, costShareId } = await params;
    const parsed = updateCostShareSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      costShare: await updateCostShare(user.id, communityId, costShareId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
