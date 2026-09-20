import type { SocialReactionType } from "@prisma/client";

export const SOCIAL_PAGE_SIZE = 15;
export const MAX_SOCIAL_MEDIA = 4;
export const MAX_SOCIAL_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_SOCIAL_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_SOCIAL_REQUEST_BYTES = 32 * 1024 * 1024;
export const SOCIAL_MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm";

export const socialReactions: ReadonlyArray<{
  type: SocialReactionType;
  emoji: string;
  label: string;
}> = [
  { type: "LIKE", emoji: "👍", label: "Curti" },
  { type: "LOVE", emoji: "❤️", label: "Amei" },
  { type: "CELEBRATE", emoji: "🎉", label: "Comemorar" },
  { type: "LAUGH", emoji: "😄", label: "Haha" },
  { type: "SUPPORT", emoji: "🙌", label: "Apoio" },
];

export function socialReactionLabel(type: SocialReactionType) {
  return socialReactions.find((reaction) => reaction.type === type)!;
}
