import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import {
  communityEmailSettingsSchema,
  emailSettingsCommunityIdSchema,
} from "@/lib/validation/email-settings";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  deleteCommunityEmailSettings,
  getCommunityEmailSettings,
  saveCommunityEmailSettings,
} from "@/server/services/email-settings-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = emailSettingsCommunityIdSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    return NextResponse.json(await getCommunityEmailSettings(user.id, ids.data.communityId));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = emailSettingsCommunityIdSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const parsed = communityEmailSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    return NextResponse.json({
      settings: await saveCommunityEmailSettings(user.id, ids.data.communityId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = emailSettingsCommunityIdSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    await deleteCommunityEmailSettings(user.id, ids.data.communityId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
