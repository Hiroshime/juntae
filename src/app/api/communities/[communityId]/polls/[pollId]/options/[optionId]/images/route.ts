import { NextResponse } from "next/server";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import {
  MAX_POLL_MULTIPART_BYTES,
  MAX_POLL_OPTION_IMAGES,
  validatePollImageUploads,
  type PollImageUpload,
} from "@/lib/polls/images";
import { pollOptionParamsSchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { throwPollImageUploadError } from "@/server/http/poll-image-upload";
import { addPollOptionImages } from "@/server/services/poll-service";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ communityId: string; pollId: string; optionId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = pollOptionParamsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Votação ou opção inválida.");
    await enforceRateLimit(`poll-album:${user.id}`, 20, 10 * 60 * 1_000);

    const form = await readBoundedFormData(request, MAX_POLL_MULTIPART_BYTES);
    if (Array.from(form.keys()).some((key) => key !== "images")) {
      throw new AppError("Campo de envio inválido.");
    }
    const files = form.getAll("images");
    if (!files.length || files.length > MAX_POLL_OPTION_IMAGES) {
      throw new AppError(`Selecione entre 1 e ${MAX_POLL_OPTION_IMAGES} fotos.`);
    }
    const rawImages: Array<Omit<PollImageUpload, "contentType" | "sortOrder" | "sizeBytes">> = [];
    for (const file of files) {
      if (typeof file === "string") throw new AppError("Foto inválida.");
      rawImages.push({
        optionIndex: 0,
        originalName: file.name,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }
    let images: PollImageUpload[];
    try {
      images = validatePollImageUploads(rawImages, 1);
    } catch (error) {
      throwPollImageUploadError(error);
    }
    return NextResponse.json(
      {
        images: await addPollOptionImages(
          user.id,
          ids.data.communityId,
          ids.data.pollId,
          ids.data.optionId,
          images,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
