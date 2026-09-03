import { NextResponse } from "next/server";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { randomizerRequestSchema } from "@/lib/validation/randomizer";
import { requireAuthenticatedUser } from "@/server/authorization";
import { generateRandomizerResult } from "@/server/services/randomizer-service";

type Context = { params: Promise<{ communityId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    const { communityId } = await params;
    const parsed = randomizerRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Configuração inválida." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      result: await generateRandomizerResult(user.id, communityId, parsed.data),
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
