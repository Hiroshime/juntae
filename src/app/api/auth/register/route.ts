import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";
import { registerUser } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`register:${clientIdentifier(request)}`, 5, 60 * 60 * 1_000);
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );

    const { password } = parsed.data;
    const result = await registerUser({
      email: parsed.data.email,
      name: parsed.data.name,
      inviteToken: parsed.data.inviteToken,
      bootstrapToken: parsed.data.bootstrapToken,
      passwordHash: await hash(password, 12),
    });
    await createSession(result.user.id, result.user.sessionVersion);
    return NextResponse.json(
      {
        user: { id: result.user.id, name: result.user.name, email: result.user.email },
        community: result.community,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
