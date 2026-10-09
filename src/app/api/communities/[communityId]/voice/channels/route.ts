import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { voiceChannelInputSchema, voiceCommunityIdsSchema } from "@/lib/validation/voice";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { createVoiceChannel, listVoiceChannels } from "@/server/services/voice-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = voiceCommunityIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const response = NextResponse.json(await listVoiceChannels(user.id, ids.data.communityId));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = voiceCommunityIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `voice-channel-create:${ids.data.communityId}:${user.id}`,
      20,
      60 * 60 * 1000,
    );
    const input = voiceChannelInputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new AppError(input.error.issues[0].message);
    const channel = await createVoiceChannel(user.id, ids.data.communityId, input.data);
    return NextResponse.json({ ...channel, participantCount: 0 }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
