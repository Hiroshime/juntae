import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { acceptInvite } from "@/server/services/community-service";

type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { token } = await params;
    return NextResponse.json({ community: await acceptInvite(user.id, token) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
