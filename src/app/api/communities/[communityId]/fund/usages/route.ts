import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { communityFundUsageSchema } from "@/lib/validation/community-fund";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { createCommunityFundUsage } from "@/server/services/community-fund-service";

type Context = { params: Promise<{ communityId: string }> };
const ids = z.object({ communityId: z.string().uuid() });

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsedIds = ids.safeParse(await params);
    const parsed = communityFundUsageSchema.safeParse(await request.json().catch(() => null));
    if (!parsedIds.success) throw new AppError("Comunidade inválida.");
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Uso inválido.");
    await createCommunityFundUsage(user.id, parsedIds.data.communityId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
