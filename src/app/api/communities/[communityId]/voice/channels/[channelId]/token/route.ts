import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { voiceChannelIdsSchema } from "@/lib/validation/voice";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { issueVoiceChannelToken } from "@/server/services/voice-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ communityId: string; channelId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = voiceChannelIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Sala de voz inválida.");
    await enforceRateLimit(`voice-token:${ids.data.communityId}:${user.id}`, 60, 10 * 60 * 1000);
    return NextResponse.json(
      await issueVoiceChannelToken(user.id, ids.data.communityId, ids.data.channelId),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
