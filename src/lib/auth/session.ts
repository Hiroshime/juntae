import { prisma } from "@/lib/db/prisma";
import { getEnv } from "@/lib/env";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "juntae_session";
const LEGACY_SESSION_COOKIE = "galera_session";

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
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
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
