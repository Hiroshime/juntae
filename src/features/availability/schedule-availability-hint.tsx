export type ScheduleAvailabilityWindow = {
  name: string;
  workingIntervals: Array<{ startMinute: number; endMinute: number }>;
  freeIntervals: Array<{ startMinute: number; endMinute: number }>;
};

function formatMinute(value: number) {
  const normalized = value === 1440 ? 0 : value;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatScheduleFreeTime(schedule: ScheduleAvailabilityWindow) {
  const { freeIntervals, workingIntervals } = schedule;
  if (freeIntervals.length === 0) {
    return workingIntervals.some(
      (interval) => interval.startMinute === 0 && interval.endMinute === 1440,
    )
      ? "Trabalhando o dia inteiro (sem horário definido)"
      : "Sem horário livre neste dia";
  }
  if (
    freeIntervals.length === 1 &&
    freeIntervals[0].startMinute === 0 &&
    freeIntervals[0].endMinute === 1440
  ) {
    return "Livre o dia inteiro";
  }

  const parts = freeIntervals.map((interval) => {
    if (interval.startMinute === 0) return `até ${formatMinute(interval.endMinute)}`;
    if (interval.endMinute === 1440) return `após ${formatMinute(interval.startMinute)}`;
    return `das ${formatMinute(interval.startMinute)} às ${formatMinute(interval.endMinute)}`;
  });
  return `Livre ${parts.join(" e ")}`;
}

export function ScheduleAvailabilityHint({
  schedule,
}: {
  schedule: ScheduleAvailabilityWindow | null;
}) {
  if (!schedule) return null;
  return (
    <small className="schedule-availability-hint">
      {formatScheduleFreeTime(schedule)} · {schedule.name}
    </small>
  );
}
