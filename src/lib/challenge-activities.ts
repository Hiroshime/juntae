import type { ChallengeConfiguration } from "@/lib/validation/challenge";
import type { ChallengeActivityInput } from "@/lib/validation/challenge-activity";
import { getChallengeModalities } from "@/lib/fitness-modalities";

export const MAX_ACTIVITY_PHOTOS = 3;
export const MAX_ACTIVITY_PHOTO_BYTES = 6 * 1024 * 1024;
export const MAX_ACTIVITY_REQUEST_BYTES = 20 * 1024 * 1024;
export const ACTIVITY_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

// Scores are stored with one decimal place; durations and distances remain integer seconds/meters.
export function scoreChallengeActivity(
  config: ChallengeConfiguration,
  activity: Pick<ChallengeActivityInput, "durationSeconds" | "distanceMeters" | "activityType">,
) {
  const modality = getChallengeModalities(config).find((item) => item.id === activity.activityType);
  if (!modality) throw new Error("Modalidade não habilitada neste desafio.");
  switch (config.scoring.metric) {
    case "POINTS": {
      if (!modality.pointsPerMetric) return modality.points;
      const metricValue =
        modality.pointsPerMetric.metric === "DURATION"
          ? activity.durationSeconds
          : activity.distanceMeters;
      if (!metricValue) return 0;
      return (
        Math.round((metricValue * modality.points * 10) / modality.pointsPerMetric.unitValue) / 10
      );
    }
    case "DURATION":
      return activity.durationSeconds;
    case "DISTANCE":
      return activity.distanceMeters ?? 0;
  }
}
export function formatActivityScore(
  value: number,
  metric: ChallengeConfiguration["scoring"]["metric"],
) {
  if (metric === "DISTANCE")
    return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km`;
  if (metric === "DURATION") {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;
    return [hours ? `${hours} h` : "", `${minutes} min`, seconds ? `${seconds} s` : ""]
      .filter(Boolean)
      .join(" ");
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pts`;
}
