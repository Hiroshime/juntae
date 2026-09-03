import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/http/route";
import { getSessionUser } from "@/lib/auth/session";
import { getInvitePreview } from "@/server/services/community-service";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const user = await getSessionUser();
    return NextResponse.json(await getInvitePreview(token, user?.id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
