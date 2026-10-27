import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { addPollOptionSchema, pollParamsSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { addPollOption } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = pollParamsSchema.safeParse(await params);
    const parsed = addPollOptionSchema.safeParse(await request.json().catch(() => null));
    if (!ids.success || !parsed.success)
      return NextResponse.json(
        { error: !parsed.success ? parsed.error.issues[0]?.message : "Identificador inválido." },
        { status: 400 },
      );
    return NextResponse.json(
      { option: await addPollOption(user.id, ids.data.communityId, ids.data.pollId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
