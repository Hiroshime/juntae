import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { pollParamsSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { closePoll } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string; pollId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = pollParamsSchema.safeParse(await params);
    if (!parsed.success) throw new AppError("Votação inválida.");
    const { communityId, pollId } = parsed.data;
    await enforceRateLimit(`poll-management:${user.id}`, 20, 10 * 60 * 1_000);
    return NextResponse.json({ poll: await closePoll(user.id, communityId, pollId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
