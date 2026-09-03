import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { castVoteSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { castVote, removeVote } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, pollId } = await params;
    const parsed = castVoteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(await castVote(user.id, communityId, pollId, parsed.data.optionIds));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, pollId } = await params;
    return NextResponse.json(await removeVote(user.id, communityId, pollId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
