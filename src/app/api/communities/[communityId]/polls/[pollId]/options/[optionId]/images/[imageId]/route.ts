import { requireAuthenticatedUser } from "@/server/authorization";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { pollOptionImageParamsSchema } from "@/lib/validation/poll";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { AppError } from "@/server/errors";
import { deletePollOptionImage, getPollOptionImage } from "@/server/services/poll-service";

type Context = {
  params: Promise<{
    communityId: string;
    pollId: string;
    optionId: string;
    imageId: string;
  }>;
};

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const parsed = pollOptionImageParamsSchema.safeParse(await params);
    if (!parsed.success) throw new AppError("Imagem inválida.");
    const { communityId, pollId, optionId, imageId } = parsed.data;
    const image = await getPollOptionImage(user.id, communityId, pollId, optionId, imageId);
    return new Response(image.data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.sizeBytes),
        "Content-Type": image.contentType,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const parsed = pollOptionImageParamsSchema.safeParse(await params);
    if (!parsed.success) throw new AppError("Imagem inválida.");
    const { communityId, pollId, optionId, imageId } = parsed.data;
    await enforceRateLimit(`poll-album:${user.id}`, 20, 10 * 60 * 1_000);
    return Response.json({
      image: await deletePollOptionImage(user.id, communityId, pollId, optionId, imageId),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
