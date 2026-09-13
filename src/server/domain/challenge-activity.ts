import { civilDateInTimeZone, formatCivilDate } from "@/lib/dates/civil-date";
import { challengeState } from "@/lib/challenges";
import type { ChallengeConfiguration } from "@/lib/validation/challenge";
import type { ChallengeActivityInput } from "@/lib/validation/challenge-activity";
import { AppError } from "@/server/errors";
import { getChallengeModalities } from "@/lib/fitness-modalities";

export function validateActivityEligibility(
  challenge: {
    startDate: Date;
    endDate: Date;
    timezone: string;
    cancelledAt: Date | null;
  },
  configuration: ChallengeConfiguration,
  participant: { joinedAt: Date; leftAt: Date | null },
  input: ChallengeActivityInput,
  photoCount: number,
  now = new Date(),
) {
  if (challengeState(challenge, now) !== "ACTIVE")
    throw new AppError(
      "Treinos só podem ser publicados enquanto o desafio está em andamento.",
      409,
    );
  if (participant.leftAt) throw new AppError("Entre no desafio para publicar seus treinos.", 403);
  if (!getChallengeModalities(configuration).some((item) => item.id === input.activityType))
    throw new AppError("Modalidade não habilitada neste desafio.");
  const today = civilDateInTimeZone(now, challenge.timezone);
  if (
    input.performedOn < formatCivilDate(challenge.startDate) ||
    input.performedOn > formatCivilDate(challenge.endDate) ||
    input.performedOn > today ||
    input.performedOn < civilDateInTimeZone(participant.joinedAt, challenge.timezone)
  ) {
    throw new AppError(
      "Use uma data do desafio, a partir da sua inscrição e não posterior a hoje.",
    );
  }
  if (input.durationSeconds < configuration.activityRules.minDurationMinutes * 60)
    throw new AppError(
      `O treino deve durar pelo menos ${configuration.activityRules.minDurationMinutes} minutos.`,
    );
  const modality = getChallengeModalities(configuration).find(
    (item) => item.id === input.activityType,
  );
  if (
    configuration.scoring.metric === "DISTANCE" ||
    (configuration.scoring.metric === "POINTS" && modality?.pointsPerMetric?.metric === "DISTANCE")
  ) {
    if (!input.distanceMeters)
      throw new AppError("Informe uma distância maior que zero neste desafio.");
  }
  if (configuration.activityRules.requirePhoto && photoCount === 0)
    throw new AppError("Este desafio exige pelo menos uma foto do treino.");
}
