import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/server/services/password-reset-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );
    await enforceRateLimit(`password-reset-ip:${clientIdentifier(request)}`, 10, 15 * 60 * 1_000);
    await enforceRateLimit(`password-reset-token:${parsed.data.token}`, 5, 60 * 60 * 1_000);
    await resetPassword(parsed.data);
    await clearSession();
    return NextResponse.json({ message: "Senha redefinida com segurança." });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
