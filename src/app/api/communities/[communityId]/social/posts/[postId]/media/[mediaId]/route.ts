import { routeErrorResponse } from "@/lib/http/route";
import { socialMediaIdsSchema } from "@/lib/validation/social";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { getSocialMedia } from "@/server/services/social-service";

type Context = {
  params: Promise<{ communityId: string; postId: string; mediaId: string }>;
};
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = socialMediaIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Anexo inválido.");
    const media = await getSocialMedia(
      user.id,
      ids.data.communityId,
      ids.data.postId,
      ids.data.mediaId,
    );
    const filename =
      media.contentType === "video/mp4"
        ? "juntae-video.mp4"
        : media.contentType === "video/webm"
          ? "juntae-video.webm"
          : "juntae-imagem.webp";
    return new Response(media.data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": media.contentType,
        "Content-Length": String(media.data.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
