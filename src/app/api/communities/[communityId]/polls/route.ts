import { NextResponse } from "next/server";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import {
  MAX_POLL_MULTIPART_BYTES,
  validatePollImageUploads,
  type PollImageUpload,
} from "@/lib/polls/images";
import { createPollSchema, pollListQuerySchema } from "@/lib/validation/poll";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import { throwPollImageUploadError } from "@/server/http/poll-image-upload";
import { createPoll, listPolls } from "@/server/services/poll-service";

type Context = { params: Promise<{ communityId: string }> };

async function readCreatePollRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return {
      body: await request.json().catch(() => null),
      rawImages: [] as Array<Omit<PollImageUpload, "contentType" | "sortOrder" | "sizeBytes">>,
    };
  }

  const form = await readBoundedFormData(request, MAX_POLL_MULTIPART_BYTES);
  const serialized = form.get("payload");
  // Up to 200 rich options across ten questions; the whole upload is still bounded to 32 MB.
  if (typeof serialized !== "string" || serialized.length > 3_000_000) {
    throw new AppError("Dados da votação inválidos.", 400, "INVALID_POLL_PAYLOAD");
  }

  let body: unknown;
  try {
    body = JSON.parse(serialized);
  } catch {
    throw new AppError("Dados da votação inválidos.", 400, "INVALID_POLL_PAYLOAD");
  }

  const rawImages = await Promise.all(
    Array.from(form.entries()).flatMap(([field, value]) => {
      const match = /^optionImages:(\d+)$/.exec(field);
      if (!match || typeof value === "string") return [];
      return [
        value.arrayBuffer().then((buffer) => ({
          optionIndex: Number(match[1]),
          originalName: value.name,
          data: new Uint8Array(buffer),
        })),
      ];
    }),
  );
  return { body, rawImages };
}

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = pollListQuerySchema.safeParse({
      eventId: search.get("event") ?? undefined,
      scope: search.get("scope") ?? "OPEN",
      take: search.get("take") ?? 50,
      page: search.get("page") ?? 1,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const polls = await listPolls(user.id, communityId, {
      ...parsed.data,
      skip: (parsed.data.page - 1) * parsed.data.take,
    });
    return NextResponse.json({ polls, page: parsed.data.page });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const requestData = await readCreatePollRequest(request);
    const body = requestData.body;
    const parsed = createPollSchema.safeParse(
      body && typeof body === "object" && "type" in body && body.type === "DATE_OPTIONS"
        ? { ...body, timezone: user.timezone }
        : body,
    );
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    let images: PollImageUpload[];
    try {
      images = validatePollImageUploads(
        requestData.rawImages,
        parsed.data.type === "DATE_OPTIONS"
          ? 0
          : parsed.data.type === "GROUPED"
            ? parsed.data.questions.reduce((count, question) => count + question.options.length, 0)
            : parsed.data.options.length,
      );
    } catch (error) {
      throwPollImageUploadError(error);
    }
    return NextResponse.json(
      { poll: await createPoll(user.id, communityId, parsed.data, images) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
