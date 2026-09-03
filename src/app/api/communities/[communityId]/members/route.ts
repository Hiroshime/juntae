import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { listCommunityMembers } from "@/server/services/community-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json({ members: await listCommunityMembers(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
