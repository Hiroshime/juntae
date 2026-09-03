import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { createInviteSchema } from "@/lib/validation/community";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createInvite, listInvites } from "@/server/services/community-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json({ invites: await listInvites(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = createInviteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const result = await createInvite(user.id, communityId, parsed.data);
    return NextResponse.json(
      {
        invite: result.invite,
        url: `${new URL(request.url).origin}/join/${result.token}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
