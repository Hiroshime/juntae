import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { enforceRateLimit } from "@/lib/http/rate-limit";
import { createInviteRequestSchema } from "@/lib/validation/community";
import { requireAuthenticatedUser } from "@/server/authorization";
import { createInvite, listInvites } from "@/server/services/community-service";
import { sendCommunityInviteEmail } from "@/server/services/email-settings-service";
import { AppError } from "@/server/errors";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    return NextResponse.json({ invites: await listInvites(user.id, communityId) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = createInviteRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    if (parsed.data.recipientEmail)
      await enforceRateLimit(`invite-email:${communityId}:${user.id}`, 20, 60 * 60 * 1000);
    const result = await createInvite(user.id, communityId, parsed.data);
    const url = `${new URL(request.url).origin}/join/${result.token}`;
    let email: { status: "SENT" | "FAILED"; message?: string } | null = null;
    if (parsed.data.recipientEmail) {
      try {
        await sendCommunityInviteEmail(user.id, communityId, parsed.data.recipientEmail, url);
        email = { status: "SENT" };
      } catch (error) {
        email = {
          status: "FAILED",
          message:
            error instanceof AppError
              ? error.message
              : "O convite foi criado, mas não foi possível enviar o e-mail.",
        };
      }
    }
    return NextResponse.json(
      {
        invite: result.invite,
        url,
        email,
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
