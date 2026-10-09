import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/http/security-headers";

export function middleware() {
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(securityHeaders())) response.headers.set(name, value);
  return response;
}

export const config = {
  runtime: "nodejs",
};
