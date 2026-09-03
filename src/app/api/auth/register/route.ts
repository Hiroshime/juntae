import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { registerSchema } from "@/lib/validation/auth";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`register:${clientIdentifier(request)}`, 5, 60 * 60 * 1_000);
    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );

    const { email, name, password } = parsed.data;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists)
      return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 409 });

    const user = await prisma.user.create({
      data: { email, name, passwordHash: await hash(password, 12) },
    });
    await createSession(user.id, user.sessionVersion);
    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
