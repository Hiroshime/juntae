import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { randomizerListQuerySchema, saveRandomizerRunSchema } from "@/lib/validation/randomizer";
import { requireAuthenticatedUser } from "@/server/authorization";
import { listSavedRandomizerRuns, saveRandomizerRun } from "@/server/services/randomizer-service";

type Context = { params: Promise<{ communityId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const search = new URL(request.url).searchParams;
    const parsed = randomizerListQuerySchema.safeParse({
      page: search.get("page") ?? 1,
      take: search.get("take") ?? 20,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({
      runs: await listSavedRandomizerRuns(user.id, communityId, {
        take: parsed.data.take,
        skip: (parsed.data.page - 1) * parsed.data.take,
      }),
      page: parsed.data.page,
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = saveRandomizerRunSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Resultado inválido." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { run: await saveRandomizerRun(user.id, communityId, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
