import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { cancelEvent } from "@/server/services/event-service";

type Context = { params: Promise<{ communityId: string; eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, eventId } = await params;
    return NextResponse.json({ event: await cancelEvent(user.id, communityId, eventId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
