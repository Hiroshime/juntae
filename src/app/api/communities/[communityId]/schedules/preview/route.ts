import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { previewScheduleSchema } from "@/lib/validation/availability";
import { requireCommunityMember } from "@/server/authorization";
import { previewScheduleRule } from "@/server/services/availability-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { communityId } = await params;
    await requireCommunityMember(communityId);
    const parsed = previewScheduleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      preview: previewScheduleRule(parsed.data.rule, parsed.data.startDate, parsed.data.endDate),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
