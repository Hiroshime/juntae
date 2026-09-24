import { after, NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import {
  PASSWORD_RESET_ACCEPTED_MESSAGE,
  requestPasswordReset,
} from "@/server/services/password-reset-service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );
    const client = clientIdentifier(request);
    await enforceRateLimit(`password-forgot-ip:${client}`, 5, 60 * 60 * 1_000);
    await enforceRateLimit(`password-forgot-email:${parsed.data.email}`, 3, 60 * 60 * 1_000);
    after(async () => {
      try {
        await requestPasswordReset(parsed.data);
      } catch (error) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Password reset request failed after response",
            errorCode: error instanceof Error ? error.name : "UNKNOWN",
          }),
        );
      }
    });
    return NextResponse.json({ message: PASSWORD_RESET_ACCEPTED_MESSAGE });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
