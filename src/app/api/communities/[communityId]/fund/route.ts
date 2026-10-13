import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { communityFundSettingsSchema } from "@/lib/validation/community-fund";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  getCommunityFund,
  updateCommunityFundSettings,
} from "@/server/services/community-fund-service";

type Context = { params: Promise<{ communityId: string }> };
const ids = z.object({ communityId: z.string().uuid() });

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = ids.safeParse(await params);
    if (!parsed.success) throw new AppError("Comunidade inválida.");
    return NextResponse.json(await getCommunityFund(user.id, parsed.data.communityId), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsedIds = ids.safeParse(await params);
    const parsed = communityFundSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsedIds.success) throw new AppError("Comunidade inválida.");
    if (!parsed.success)
      throw new AppError(parsed.error.issues[0]?.message ?? "Configuração inválida.");
    await updateCommunityFundSettings(user.id, parsedIds.data.communityId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
