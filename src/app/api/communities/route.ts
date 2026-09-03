import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { createCommunitySchema } from "@/lib/validation/community";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createCommunity, listUserCommunities } from "@/server/services/community-service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    return NextResponse.json({ communities: await listUserCommunities(user.id) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = createCommunitySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json(
      { community: await createCommunity(user.id, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
