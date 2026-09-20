import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { socialCommentIdsSchema } from "@/lib/validation/social";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { deleteSocialComment } from "@/server/services/social-service";

type Context = {
  params: Promise<{ communityId: string; postId: string; commentId: string }>;
};
export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = socialCommentIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comentário inválido.");
    await deleteSocialComment(user.id, ids.data.communityId, ids.data.postId, ids.data.commentId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
