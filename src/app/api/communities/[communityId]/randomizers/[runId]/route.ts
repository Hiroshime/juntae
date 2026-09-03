import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { deleteRandomizerRun, getRandomizerRun } from "@/server/services/randomizer-service";

type Context = { params: Promise<{ communityId: string; runId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId, runId } = await params;
    return NextResponse.json({ run: await getRandomizerRun(user.id, communityId, runId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, runId } = await params;
    await deleteRandomizerRun(user.id, communityId, runId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
