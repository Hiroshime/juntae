import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { updatePollSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getPoll, updatePoll } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId, pollId } = await params;
    return NextResponse.json({ poll: await getPoll(user.id, communityId, pollId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, pollId } = await params;
    const parsed = updatePollSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      poll: await updatePoll(user.id, communityId, pollId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
