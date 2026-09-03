import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "galera_session";

function secretKey() {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function createSession(userId: string, knownSessionVersion?: number) {
  const sessionVersion =
    knownSessionVersion ??
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { sessionVersion: true },
      })
    ).sessionVersion;
  const token = await new SignJWT({ userId, sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const secure = getEnv().APP_URL.startsWith("https://");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== "string" || typeof payload.sessionVersion !== "number") {
      return null;
    }
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.sessionVersion !== payload.sessionVersion) return null;
    return user;
  } catch {
    return null;
  }
}
