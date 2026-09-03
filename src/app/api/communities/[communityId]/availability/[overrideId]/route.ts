import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { availabilityOverrideSchema } from "@/lib/validation/availability";
import { requireAuthenticatedUser } from "@/server/authorization";
import {
  deleteAvailabilityOverride,
  updateAvailabilityOverride,
} from "@/server/services/availability-service";

type Context = { params: Promise<{ communityId: string; overrideId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, overrideId } = await params;
    const parsed = availabilityOverrideSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      override: await updateAvailabilityOverride(user.id, communityId, overrideId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, overrideId } = await params;
    await deleteAvailabilityOverride(user.id, communityId, overrideId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
