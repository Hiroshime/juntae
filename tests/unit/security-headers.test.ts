import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/http/security-headers";

describe("headers de segurança", () => {
  it("libera somente a origem LiveKit configurada e o microfone da própria página", () => {
    const headers = securityHeaders({
      nodeEnv: "production",
      liveKitUrl: "wss://voz.example.com:7443/rtc?ignored=true",
    });
    expect(headers["Content-Security-Policy"]).toContain(
      "connect-src 'self' wss://voz.example.com:7443",
    );
    const connectDirective = headers["Content-Security-Policy"]
      .split("; ")
      .find((directive) => directive.startsWith("connect-src"));
    expect(connectDirective).toBe("connect-src 'self' wss://voz.example.com:7443");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(self), geolocation=()");
  });

  it("não amplia a política quando a URL está ausente ou inválida", () => {
    expect(
      securityHeaders({ nodeEnv: "production", liveKitUrl: "https://voz.example.com" })[
        "Content-Security-Policy"
      ],
    ).toContain("connect-src 'self';");
    expect(
      securityHeaders({ nodeEnv: "production", liveKitUrl: "https://voz.example.com" })[
        "Content-Security-Policy"
      ],
    ).not.toContain("voz.example.com");
  });

  it("preserva conexões de desenvolvimento para hot reload", () => {
    expect(securityHeaders({ nodeEnv: "development" })["Content-Security-Policy"]).toContain(
      "connect-src 'self' ws: http: https:",
    );
  });
});
