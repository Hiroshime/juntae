import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { profileSchema } from "@/lib/validation/profile";
import { requireAuthenticatedUser } from "@/server/authorization";
import { getProfile, updateProfile } from "@/server/services/profile-service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    return NextResponse.json({ profile: await getProfile(user.id) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = profileSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ profile: await updateProfile(user.id, parsed.data) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
