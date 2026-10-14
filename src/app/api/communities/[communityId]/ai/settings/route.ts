import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { communityAiIdsSchema, communityAiSettingsSchema } from "@/lib/validation/community-ai";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  getCommunityAiSettings,
  saveCommunityAiSettings,
} from "@/server/services/community-ai-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = communityAiIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    return NextResponse.json(await getCommunityAiSettings(user.id, ids.data.communityId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = communityAiIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const input = communityAiSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) throw new AppError(input.error.issues[0].message);
    return NextResponse.json({
      settings: await saveCommunityAiSettings(user.id, ids.data.communityId, input.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
