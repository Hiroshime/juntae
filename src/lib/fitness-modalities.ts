import type { ChallengeConfiguration } from "@/lib/validation/challenge";

export const fitnessModalityLabels = {
  WALK: "Caminhada",
  RUN: "Corrida",
  BIKE: "Ciclismo",
  STRENGTH: "Musculação",
  SWIM: "Natação",
  RUN_INDOOR: "Corrida indoor",
  WALK_INDOOR: "Caminhada indoor",
  BIKE_INDOOR: "Ciclismo indoor",
  PILATES: "Pilates",
  STRETCHING: "Alongamento",
  HOME_WORKOUT: "Exercício em casa",
  JUMP_ROPE: "Pular corda",
  WATER_AEROBICS: "Hidroginástica",
  TAI_CHI: "Tai-chi",
  SPORT: "Esporte",
  OTHER: "Outro treino",
};
export const legacyModalityIds = [
  "WALK",
  "RUN",
  "BIKE",
  "STRENGTH",
  "SWIM",
  "SPORT",
  "OTHER",
] as const;
export type FitnessModality = {
  id: string;
  label: string;
  points: number;
  pointsPerMetric?: { metric: "DURATION" | "DISTANCE"; unitValue: number };
};
export function normalizeModalityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}
export function getChallengeModalities(config: ChallengeConfiguration): FitnessModality[] {
  return (
    config.modalities ??
    legacyModalityIds.map((id) => ({
      id,
      label: fitnessModalityLabels[id],
      points: config.scoring.metric === "POINTS" ? config.scoring.pointsPerActivity : 10,
    }))
  );
}

export function formatModalityScoring(modality: FitnessModality) {
  if (!modality.pointsPerMetric) return `${modality.points} pts por treino`;
  const unit =
    modality.pointsPerMetric.metric === "DURATION"
      ? `${modality.pointsPerMetric.unitValue / 60} min`
      : `${(modality.pointsPerMetric.unitValue / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} km`;
  return `${modality.points} pts a cada ${unit}`;
}
