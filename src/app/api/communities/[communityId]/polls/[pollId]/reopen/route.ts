import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { pollParamsSchema, reopenPollSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { reopenPoll } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = pollParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Votação inválida.");
    const input = reopenPollSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new AppError(input.error.issues[0]?.message ?? "Período inválido.");
    await enforceRateLimit(`poll-management:${user.id}`, 20, 10 * 60 * 1_000);
    return NextResponse.json({
      poll: await reopenPoll(user.id, ids.data.communityId, ids.data.pollId, input.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
