import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { updateCommunitySchema } from "@/lib/validation/community";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getCommunity, updateCommunity } from "@/server/services/community-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json(await getCommunity(user.id, communityId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = updateCommunitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      community: await updateCommunity(user.id, communityId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
