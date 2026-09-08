import { requireAuthenticatedUser } from "@/server/authorization";
import { getPollOptionImage } from "@/server/services/poll-service";
import { routeErrorResponse } from "@/lib/http/route";

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
    const { communityId, pollId, optionId, imageId } = await params;
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
