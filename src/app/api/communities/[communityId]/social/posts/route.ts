import { NextResponse } from "next/server";
import { MAX_SOCIAL_MEDIA, MAX_SOCIAL_REQUEST_BYTES } from "@/lib/social";
import { readBoundedFormData } from "@/lib/http/bounded-form-data";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import {
  socialCommunityIdsSchema,
  socialPageSchema,
  socialPostSchema,
} from "@/lib/validation/social";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";
import {
  createSocialPost,
  getSocialAccess,
  listSocialPosts,
} from "@/server/services/social-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ communityId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const ids = socialCommunityIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const page = socialPageSchema.parse(new URL(request.url).searchParams.get("page"));
    return NextResponse.json(await listSocialPosts(user.id, ids.data.communityId, page));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const ids = socialCommunityIdsSchema.safeParse(await params);
    if (!ids.success) throw new AppError("Comunidade inválida.");
    const { communityId } = ids.data;
    await getSocialAccess(user.id, communityId);
    await enforceRateLimit(`social-post:${user.id}`, 20, 10 * 60 * 1000);
    const form = await readBoundedFormData(request, MAX_SOCIAL_REQUEST_BYTES);
    if (Array.from(form.keys()).some((key) => key !== "payload" && key !== "media"))
      throw new AppError("Campo de envio inválido.");
    const payload = form.get("payload");
    if (typeof payload !== "string" || payload.length > 5500 || form.getAll("payload").length !== 1)
      throw new AppError("Dados da publicação inválidos.");
    let body: unknown;
    try {
      body = JSON.parse(payload);
    } catch {
      throw new AppError("Dados da publicação inválidos.");
    }
    const parsed = socialPostSchema.safeParse(body);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const attachments = form.getAll("media");
    if (attachments.length > MAX_SOCIAL_MEDIA)
      throw new AppError(`Envie no máximo ${MAX_SOCIAL_MEDIA} anexos por publicação.`);
    const files = [];
    for (const attachment of attachments) {
      if (typeof attachment === "string" || !attachment.size) throw new AppError("Anexo inválido.");
      files.push({
        bytes: new Uint8Array(await attachment.arrayBuffer()),
        name: attachment.name,
        declaredType: attachment.type,
      });
    }
    return NextResponse.json(
      { post: await createSocialPost(user.id, communityId, parsed.data, files) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
