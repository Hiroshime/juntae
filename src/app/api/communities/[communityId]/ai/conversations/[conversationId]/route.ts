import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { communityAiConversationIdsSchema } from "@/lib/validation/community-ai";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { deleteAiConversation, getAiConversation } from "@/server/services/community-ai-service";

type Context = { params: Promise<{ communityId: string; conversationId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = communityAiConversationIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Conversa inválida.");
    return NextResponse.json(
      await getAiConversation(user.id, ids.data.communityId, ids.data.conversationId),
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = communityAiConversationIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Conversa inválida.");
    await deleteAiConversation(user.id, ids.data.communityId, ids.data.conversationId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
