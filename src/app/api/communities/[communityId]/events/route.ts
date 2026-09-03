import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { eventListQuerySchema, eventSchema } from "@/lib/validation/event";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createEvent, listEvents } from "@/server/services/event-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = eventListQuerySchema.safeParse({
      scope: search.get("scope") ?? "UPCOMING",
      take: search.get("take") ?? 50,
      page: search.get("page") ?? 1,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const events = await listEvents(user.id, communityId, {
      ...parsed.data,
      skip: (parsed.data.page - 1) * parsed.data.take,
    });
    return NextResponse.json({ events, page: parsed.data.page });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = eventSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(
      { event: await createEvent(user.id, communityId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
