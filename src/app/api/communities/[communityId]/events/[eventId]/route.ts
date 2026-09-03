import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { eventSchema } from "@/lib/validation/event";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getEvent, updateEvent } from "@/server/services/event-service";

type Context = { params: Promise<{ communityId: string; eventId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId, eventId } = await params;
    return NextResponse.json({ event: await getEvent(user.id, communityId, eventId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, eventId } = await params;
    const parsed = eventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      event: await updateEvent(user.id, communityId, eventId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
