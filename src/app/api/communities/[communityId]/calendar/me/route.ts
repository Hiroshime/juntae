import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/http/route";
import { calendarQuerySchema } from "@/lib/validation/availability";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getMyCalendar } from "@/server/services/availability-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = calendarQuerySchema.safeParse({
      startDate: search.get("startDate"),
      endDate: search.get("endDate"),
      periodOfDay: search.get("periodOfDay") ?? "ALL",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ calendar: await getMyCalendar(user.id, communityId, parsed.data) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
