import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { AuthorizationError } from "@/server/authorization";
import { AppError } from "@/server/errors";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || requestUrl.protocol.replace(":", "");
  const effectiveOrigin = `${protocol}://${host}`;

  if (origin !== requestUrl.origin && origin !== effectiveOrigin) {
    throw new AppError("Origem da requisição inválida.", 403, "INVALID_ORIGIN");
  }
}

export function routeErrorResponse(error: unknown) {
  if (error instanceof AppError || error instanceof AuthorizationError) {
    const status = error.status;
    const code =
      error instanceof AuthorizationError
        ? status === 401
          ? "UNAUTHORIZED"
          : "FORBIDDEN"
        : error.code;
    return NextResponse.json({ error: error.message, code }, { status });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json(
      { error: "Já existe um registro com esses dados.", code: "CONFLICT" },
      { status: 409 },
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled route error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return NextResponse.json(
    { error: "Não foi possível concluir a operação.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
