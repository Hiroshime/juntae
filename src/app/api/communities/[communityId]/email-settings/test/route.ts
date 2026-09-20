import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { emailSettingsCommunityIdSchema } from "@/lib/validation/email-settings";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { testCommunityEmailSettings } from "@/server/services/email-settings-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = emailSettingsCommunityIdSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await enforceRateLimit(
      `email-settings-test:${ids.data.communityId}:${user.id}`,
      5,
      60 * 60 * 1000,
    );
    return NextResponse.json({
      test: await testCommunityEmailSettings(user.id, ids.data.communityId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
