import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { communityFundEntryActionSchema } from "@/lib/validation/community-fund";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { changeCommunityFundEntry } from "@/server/services/community-fund-service";

type Context = { params: Promise<{ communityId: string; entryId: string }> };
const ids = z.object({ communityId: z.string().uuid(), entryId: z.string().uuid() });

export async function PATCH(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsedIds = ids.safeParse(await params);
    const parsed = communityFundEntryActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsedIds.success) throw new AppError("Lançamento inválido.");
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Ação inválida.");
    await changeCommunityFundEntry(
      user.id,
      parsedIds.data.communityId,
      parsedIds.data.entryId,
      parsed.data,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
