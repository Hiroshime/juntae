import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { eventAccountActionSchema } from "@/lib/validation/event-account";
import { requireAuthenticatedUser } from "@/server/authorization";
import { changeEventAccount, getEventAccount } from "@/server/services/event-account-service";

type Context = { params: Promise<{ communityId: string; eventId: string }> };
const ids = z.object({ communityId: z.string().uuid(), eventId: z.string().uuid() });

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = ids.safeParse(await params);
    if (!parsed.success)
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    return NextResponse.json(
      await getEventAccount(user.id, parsed.data.communityId, parsed.data.eventId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsedIds = ids.safeParse(await params);
    const parsed = eventAccountActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsedIds.success || !parsed.success)
      return NextResponse.json({ error: "Confira os dados do lançamento." }, { status: 400 });
    await changeEventAccount(
      user.id,
      parsedIds.data.communityId,
      parsedIds.data.eventId,
      parsed.data,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
