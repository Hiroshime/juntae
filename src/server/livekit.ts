import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { getLiveKitConfig, type LiveKitConfig } from "@/lib/env";

function apiUrl(websocketUrl: string) {
  const url = new URL(websocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.toString().replace(/\/$/, "");
}

export function liveKitRoomService(config: LiveKitConfig) {
  return new RoomServiceClient(apiUrl(config.url), config.apiKey, config.apiSecret, {
    requestTimeout: 5,
  });
}

export function configuredLiveKit() {
  const config = getLiveKitConfig();
  return config ? { config, rooms: liveKitRoomService(config) } : null;
}

export async function createVoiceAccessToken(input: {
  config: LiveKitConfig;
  room: string;
  identity: string;
  name: string;
  metadata: string;
}) {
  const token = new AccessToken(input.config.apiKey, input.config.apiSecret, {
    identity: input.identity,
    name: input.name,
    metadata: input.metadata,
    ttl: "5m",
  });
  token.addGrant({
    room: input.room,
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: [TrackSource.MICROPHONE],
  });
  return token.toJwt();
}
