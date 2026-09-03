import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { createPollSchema, pollListQuerySchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createPoll, listPolls } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = pollListQuerySchema.safeParse({
      scope: search.get("scope") ?? "OPEN",
      take: search.get("take") ?? 50,
      page: search.get("page") ?? 1,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const polls = await listPolls(user.id, communityId, {
      ...parsed.data,
      skip: (parsed.data.page - 1) * parsed.data.take,
    });
    return NextResponse.json({ polls, page: parsed.data.page });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = createPollSchema.safeParse(
      body && typeof body === "object" && "type" in body && body.type === "DATE_OPTIONS"
        ? { ...body, timezone: user.timezone }
        : body,
    );
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(
      { poll: await createPoll(user.id, communityId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
