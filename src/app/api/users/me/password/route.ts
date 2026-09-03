import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";
import { changePasswordSchema } from "@/lib/validation/profile";
import { requireAuthenticatedUser } from "@/server/authorization";
import { changePassword } from "@/server/services/profile-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    await enforceRateLimit(`password:${user.id}:${clientIdentifier(request)}`, 5, 15 * 60 * 1_000);
    const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const result = await changePassword(user.id, parsed.data);
    await createSession(user.id, result.sessionVersion);
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
