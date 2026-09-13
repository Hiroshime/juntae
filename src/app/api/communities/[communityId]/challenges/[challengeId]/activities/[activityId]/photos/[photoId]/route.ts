import { routeErrorResponse } from "@/lib/http/route";
import { challengePhotoIdsSchema } from "@/lib/validation/challenge-activity";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { getChallengePhoto } from "@/server/services/challenge-activity-service";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      communityId: string;
      challengeId: string;
      activityId: string;
      photoId: string;
    }>;
  },
) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = challengePhotoIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Foto inválida.");
    const { communityId, challengeId, activityId, photoId } = ids.data;
    const photo = await getChallengePhoto(user.id, communityId, challengeId, activityId, photoId);
    return new Response(photo.data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "image/webp",
        "Content-Length": String(photo.data.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline; filename=treino.webp",
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
