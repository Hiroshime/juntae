import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { holidaySchema } from "@/lib/validation/holiday";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createCommunityHoliday, listCommunityHolidays } from "@/server/services/holiday-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json({ holidays: await listCommunityHolidays(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = holidaySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(
      { holiday: await createCommunityHoliday(user.id, communityId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
