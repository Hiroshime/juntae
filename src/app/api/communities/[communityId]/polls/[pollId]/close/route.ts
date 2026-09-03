import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { closePoll } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, pollId } = await params;
    return NextResponse.json({ poll: await closePoll(user.id, communityId, pollId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
