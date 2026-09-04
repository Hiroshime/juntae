import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { deleteCommunityHoliday } from "@/server/services/holiday-service";

type Context = { params: Promise<{ communityId: string; holidayId: string }> };

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, holidayId } = await params;
    await deleteCommunityHoliday(user.id, communityId, holidayId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
