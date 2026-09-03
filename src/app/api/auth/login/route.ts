import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { credentialsSchema } from "@/lib/validation/auth";
import { assertSameOrigin, routeErrorResponse } from "@/lib/http/route";
import { clientIdentifier, enforceRateLimit } from "@/lib/http/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(`login:${clientIdentifier(request)}`, 10, 15 * 60 * 1_000);
    const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const passwordHash =
      user?.passwordHash ?? "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttxh2R9eaXrEIdtrDoIzYlCsVb5y";
    const passwordMatches = await compare(parsed.data.password, passwordHash);
    if (!user || !passwordMatches)
      return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
    await createSession(user.id, user.sessionVersion);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
