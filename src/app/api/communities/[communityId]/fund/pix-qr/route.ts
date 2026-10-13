import { NextResponse } from "next/server";
import { z } from "zod";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { MAX_FUND_QR_BYTES, prepareCommunityFundQrCode } from "@/server/community-fund-qr";
import { AppError } from "@/server/errors";
import {
  deleteCommunityFundQrCode,
  getCommunityFundQrCode,
  saveCommunityFundQrCode,
} from "@/server/services/community-fund-service";

type Context = { params: Promise<{ communityId: string }> };
const ids = z.object({ communityId: z.string().uuid() });

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = ids.safeParse(await params);
    if (!parsed.success) throw new AppError("Comunidade inválida.");
    const qr = await getCommunityFundQrCode(user.id, parsed.data.communityId);
    return new NextResponse(qr.qrCodeData, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": qr.qrCodeContentType ?? "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = ids.safeParse(await params);
    if (!parsed.success) throw new AppError("Comunidade inválida.");
    const form = await readBoundedFormData(request, MAX_FUND_QR_BYTES + 256 * 1024);
    const file = form.get("qrCode");
    if (!(file instanceof File)) throw new AppError("Selecione a imagem do QR Code.");
    await saveCommunityFundQrCode(
      user.id,
      parsed.data.communityId,
      await prepareCommunityFundQrCode(file),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = ids.safeParse(await params);
    if (!parsed.success) throw new AppError("Comunidade inválida.");
    await deleteCommunityFundQrCode(user.id, parsed.data.communityId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
