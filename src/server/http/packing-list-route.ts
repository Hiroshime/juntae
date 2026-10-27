import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { requireAuthenticatedUser } from "@/server/authorization";
import { AppError } from "@/server/errors";

export async function packingListRoute<P extends { communityId: string }>(
  request: Request,
  context: { params: Promise<P> },
  operation: (userId: string, params: P) => Promise<unknown>,
  status = 200,
) {
  try {
    if (request.method !== "GET") assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const params = await context.params;
    if (Object.values(params).some((value) => !z.string().uuid().safeParse(value).success)) {
      throw new AppError("Identificador inválido.", 400);
    }
    return NextResponse.json(await operation(user.id, params), { status });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function packingListBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  return parsed.data;
}
