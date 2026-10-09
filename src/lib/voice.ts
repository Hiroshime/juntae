export const VOICE_CHANNEL_LIMIT = 20;

export type VoiceChannelSummary = {
  id: string;
  name: string;
  description: string | null;
  maxParticipants: number;
  participantCount: number;
};

export type VoiceChannelList = {
  configured: boolean;
  presenceAvailable: boolean;
  canManage: boolean;
  channels: VoiceChannelSummary[];
};

export type VoiceParticipantMetadata = {
  avatarUrl?: string | null;
};

export function voiceChannelNameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export function voiceRoomName(communityId: string, channelId: string) {
  return `juntae-${communityId}-${channelId}`;
}

export function parseVoiceParticipantMetadata(value: string | undefined) {
  if (!value) return {} satisfies VoiceParticipantMetadata;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const avatarUrl = "avatarUrl" in parsed ? parsed.avatarUrl : undefined;
    return typeof avatarUrl === "string" || avatarUrl === null ? { avatarUrl } : {};
  } catch {
    return {};
  }
}
