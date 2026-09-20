import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { socialPostIdsSchema } from "@/lib/validation/social";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { deleteSocialPost } from "@/server/services/social-service";

type Context = { params: Promise<{ communityId: string; postId: string }> };
export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = socialPostIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Publicação inválida.");
    await deleteSocialPost(user.id, ids.data.communityId, ids.data.postId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
