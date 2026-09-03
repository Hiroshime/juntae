import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/session";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
