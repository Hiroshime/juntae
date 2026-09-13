import { civilDateInTimeZone, formatCivilDate } from "@/lib/dates/civil-date";
import { getChallengeModalities } from "@/lib/fitness-modalities";
import type { ChallengeConfiguration } from "@/lib/validation/challenge";

export type ChallengeState = "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";
export const challengeStateLabels: Record<ChallengeState, string> = {
  SCHEDULED: "Agendado",
  ACTIVE: "Em andamento",
  ENDED: "Encerrado",
  CANCELLED: "Cancelado",
};
export const challengeMetricLabels = { POINTS: "Pontos", DURATION: "Tempo", DISTANCE: "Distância" };

export function challengeState(
  challenge: {
    startDate: Date;
    endDate: Date;
    timezone: string;
    cancelledAt: Date | null;
  },
  now = new Date(),
): ChallengeState {
  if (challenge.cancelledAt) return "CANCELLED";
  const today = civilDateInTimeZone(now, challenge.timezone);
  if (today < formatCivilDate(challenge.startDate)) return "SCHEDULED";
  if (today > formatCivilDate(challenge.endDate)) return "ENDED";
  return "ACTIVE";
}

export function challengeScoringDescription(configuration: ChallengeConfiguration) {
  const scoring = configuration.scoring;
  if (scoring.metric === "POINTS")
    return configuration.modalities
      ? getChallengeModalities(configuration).some((modality) => modality.pointsPerMetric)
        ? "Pontos por modalidade e métrica (proporcional, até 1 casa decimal)"
        : "Pontos por modalidade"
      : `${scoring.pointsPerActivity} pontos por atividade válida`;
  return scoring.metric === "DURATION"
    ? "Soma do tempo dos treinos"
    : "Soma da distância dos treinos";
}

export function formatChallengeDate(value: string) {
  return value.split("-").reverse().join("/");
}
