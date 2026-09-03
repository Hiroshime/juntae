import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { updateMemberRoleSchema } from "@/lib/validation/community";
import { communityDisplayNameSchema } from "@/lib/validation/profile";
import { requireAuthenticatedUser } from "@/server/authorization";
import {
  removeMember,
  updateMemberRole,
  updateOwnCommunityProfile,
} from "@/server/services/community-service";

type Context = { params: Promise<{ communityId: string; userId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAuthenticatedUser();
    const { communityId, userId } = await params;
    const body: unknown = await request.json().catch(() => null);

    if (userId === actor.id) {
      const parsed = communityDisplayNameSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
      }
      return NextResponse.json({
        membership: await updateOwnCommunityProfile(actor.id, communityId, parsed.data.displayName),
      });
    }

    const parsed = updateMemberRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      membership: await updateMemberRole(actor.id, communityId, userId, parsed.data.role),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const actor = await requireAuthenticatedUser();
    const { communityId, userId } = await params;
    await removeMember(actor.id, communityId, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
