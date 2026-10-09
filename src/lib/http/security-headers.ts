type SecurityHeaderOptions = {
  nodeEnv?: string;
  liveKitUrl?: string;
};

function liveKitConnectOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function securityHeaders(options: SecurityHeaderOptions = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const liveKitOrigin = liveKitConnectOrigin(options.liveKitUrl ?? process.env.LIVEKIT_URL);
  const connectSources = ["'self'"];
  if (liveKitOrigin) connectSources.push(liveKitOrigin);
  if (nodeEnv === "development") connectSources.push("ws:", "http:", "https:");

  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${nodeEnv === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return {
    "Content-Security-Policy": contentSecurityPolicy,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  } as const;
}
