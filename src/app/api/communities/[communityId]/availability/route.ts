import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { availabilityOverrideSchema } from "@/lib/validation/availability";
import { requireAuthenticatedUser } from "@/server/authorization";
import {
  createAvailabilityOverride,
  listAvailabilityOverrides,
} from "@/server/services/availability-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json({ overrides: await listAvailabilityOverrides(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = availabilityOverrideSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(
      { override: await createAvailabilityOverride(user.id, communityId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
