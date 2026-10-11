import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLiveKitConfig } from "@/lib/env";
import { voiceChannelInputSchema } from "@/lib/validation/voice";
import { parseVoiceParticipantMetadata, voiceChannelNameKey, voiceRoomName } from "@/lib/voice";
import { createVoiceAccessToken } from "@/server/livekit";

const liveKitEnvKeys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

function baseEnvironment() {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-characters");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  for (const key of [
    "PASSWORD_RESET_SMTP_HOST",
    "PASSWORD_RESET_SMTP_PORT",
    "PASSWORD_RESET_SMTP_USER",
    "PASSWORD_RESET_SMTP_PASSWORD",
    "PASSWORD_RESET_FROM_NAME",
    "PASSWORD_RESET_FROM_EMAIL",
  ])
    vi.stubEnv(key, "");
}

afterEach(() => vi.unstubAllEnvs());

describe("salas de voz", () => {
  it("normaliza nomes, salas e metadados sem confiar no cliente", () => {
    expect(voiceChannelNameKey("  Reunião   GERAL ")).toBe("reuniao geral");
    expect(voiceRoomName("community", "channel")).toBe("juntae-community-channel");
    expect(parseVoiceParticipantMetadata('{"avatarUrl":"https://example.com/avatar.png"}')).toEqual(
      {
        avatarUrl: "https://example.com/avatar.png",
      },
    );
    expect(parseVoiceParticipantMetadata("not-json")).toEqual({});
    expect(parseVoiceParticipantMetadata('{"avatarUrl":42}')).toEqual({});
  });

  it("valida os limites e remove descrições vazias", () => {
    expect(
      voiceChannelInputSchema.parse({
        name: " Geral ",
        description: "   ",
        maxParticipants: "12",
      }),
    ).toEqual({ name: "Geral", description: null, maxParticipants: 12 });
    expect(voiceChannelInputSchema.safeParse({ name: "x", maxParticipants: 1 }).success).toBe(
      false,
    );
    expect(voiceChannelInputSchema.safeParse({ name: "Sala", maxParticipants: 51 }).success).toBe(
      false,
    );
  });

  it("mantém LiveKit opcional e exige o trio de configuração", () => {
    baseEnvironment();
    for (const key of liveKitEnvKeys) vi.stubEnv(key, "");
    expect(getLiveKitConfig()).toBeNull();

    vi.stubEnv("LIVEKIT_URL", "wss://voice.example.com");
    expect(() => getLiveKitConfig()).toThrow(/Configure LIVEKIT_URL/);

    vi.stubEnv("LIVEKIT_API_KEY", "test-api-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "test-api-secret-with-32-characters");
    expect(getLiveKitConfig()).toEqual({
      url: "wss://voice.example.com",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret-with-32-characters",
    });
  });

  it("emite token curto, vinculado à sala e limitado a voz e apresentação", async () => {
    const config = {
      url: "wss://voice.example.com",
      apiKey: "test-api-key",
      apiSecret: "test-api-secret-with-32-characters",
    };
    const token = await createVoiceAccessToken({
      config,
      room: "juntae-community-channel",
      identity: "user-id",
      name: "Pessoa",
      metadata: '{"avatarUrl":null}',
    });
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token);

    expect(claims.sub).toBe("user-id");
    expect(claims.name).toBe("Pessoa");
    expect(claims.video).toMatchObject({
      room: "juntae-community-channel",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ["microphone", "screen_share", "screen_share_audio"],
    });
    const now = Math.floor(Date.now() / 1_000);
    expect(claims.exp).toBeGreaterThanOrEqual(now + 295);
    expect(claims.exp).toBeLessThanOrEqual(now + 305);
  });
});
