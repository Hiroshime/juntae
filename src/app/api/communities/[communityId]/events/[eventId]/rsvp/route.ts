import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { rsvpSchema } from "@/lib/validation/event";
import { requireAuthenticatedUser } from "@/server/authorization";
import { setEventRsvp } from "@/server/services/event-service";

type Context = { params: Promise<{ communityId: string; eventId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, eventId } = await params;
    const parsed = rsvpSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(await setEventRsvp(user.id, communityId, eventId, parsed.data));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
