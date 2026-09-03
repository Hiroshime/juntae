import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { scheduleRuleSchema } from "@/lib/validation/availability";
import { requireAuthenticatedUser } from "@/server/authorization";
import { deleteScheduleRule, updateScheduleRule } from "@/server/services/availability-service";

type Context = { params: Promise<{ communityId: string; scheduleId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, scheduleId } = await params;
    const parsed = scheduleRuleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      schedule: await updateScheduleRule(user.id, communityId, scheduleId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId, scheduleId } = await params;
    await deleteScheduleRule(user.id, communityId, scheduleId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
