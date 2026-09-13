import { NextResponse } from "next/server";
import {
  MAX_ACTIVITY_REQUEST_BYTES,
  MAX_ACTIVITY_PHOTOS,
  MAX_ACTIVITY_PHOTO_BYTES,
} from "@/lib/challenge-activities";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { challengeIdsSchema } from "@/lib/validation/challenge";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  createChallengeActivity,
  requireActivityParticipant,
} from "@/server/services/challenge-activity-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ communityId: string; challengeId: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = challengeIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Desafio inválido.");
    const { communityId, challengeId } = ids.data;
    await requireActivityParticipant(user.id, communityId, challengeId);
    await enforceRateLimit(`challenge-upload:${user.id}`, 30, 10 * 60 * 1000);
    const form = await readBoundedFormData(request, MAX_ACTIVITY_REQUEST_BYTES);
    const payload = form.get("payload");
    if (
      typeof payload !== "string" ||
      payload.length > 10000 ||
      form.getAll("payload").length !== 1
    )
      throw new AppError("Dados do treino inválidos.");
    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      throw new AppError("Dados do treino inválidos.");
    }
    const parsed = challengeActivitySchema.safeParse(body);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    if (Array.from(form.keys()).some((key) => key !== "payload" && key !== "photos"))
      throw new AppError("Campo de envio inválido.");
    const files = form.getAll("photos");
    if (files.length > MAX_ACTIVITY_PHOTOS)
      throw new AppError("Envie no máximo 3 fotos por treino.");
    const photos: Uint8Array<ArrayBuffer>[] = [];
    for (const file of files) {
      if (typeof file === "string") throw new AppError("Foto inválida.");
      if (!file.size || file.size > MAX_ACTIVITY_PHOTO_BYTES)
        throw new AppError("Cada foto deve ter entre 1 byte e 6 MB.", 413);
      photos.push(new Uint8Array(await file.arrayBuffer()));
    }
    return NextResponse.json(
      {
        activity: await createChallengeActivity(
          user.id,
          communityId,
          challengeId,
          parsed.data,
          photos,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
