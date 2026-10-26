import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { adminRsvpParamsSchema, adminRsvpSchema } from "@/lib/validation/event";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { setEventRsvpByAdmin } from "@/server/services/event-service";

type Context = {
  params: Promise<{ communityId: string; eventId: string; userId: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = adminRsvpParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Evento ou membro inválido.");
    const input = adminRsvpSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      throw new AppError(input.error.issues[0]?.message ?? "Resposta inválida.");
    }
    await enforceRateLimit(`event-rsvp-management:${user.id}`, 60, 10 * 60 * 1_000);
    return NextResponse.json(
      await setEventRsvpByAdmin(
        user.id,
        ids.data.communityId,
        ids.data.eventId,
        ids.data.userId,
        input.data,
      ),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
