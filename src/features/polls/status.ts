import type { PollStatus, PollType } from "@prisma/client";

export const pollTypeLabels: Record<PollType, string> = {
  SINGLE_CHOICE: "Escolha única",
  MULTIPLE_CHOICE: "Múltipla escolha",
  DATE_OPTIONS: "Votação de datas",
};

export const pollStatusLabels: Record<PollStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Encerrada",
};

export function formatPollDeadline(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(value);
}
