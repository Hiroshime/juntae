import type { Prisma } from "@prisma/client";
import { AppError } from "@/server/errors";

export async function assertArenaGladiatorAvailable(
  db: Prisma.TransactionClient,
  gladiatorId: string,
) {
  const gladiator = await db.arenaGladiator.findUnique({
    where: { id: gladiatorId },
    select: { injuredUntil: true },
  });
  const now = new Date();
  if (gladiator?.injuredUntil && gladiator.injuredUntil > now) {
    const availableAt = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(gladiator.injuredUntil);
    throw new AppError(
      `Seu gladiador está ferido e se recupera até ${availableAt}.`,
      409,
      "ARENA_INJURED",
    );
  }

  const raid = await db.arenaPvpRaid.findFirst({
    where: { attackerId: gladiatorId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { endsAt: true },
  });
  if (raid) {
    const availableAt = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(raid.endsAt);
    throw new AppError(
      raid.endsAt <= now
        ? "Seu saque terminou. Abra a área PvP para receber o resultado."
        : `Seu gladiador está saqueando um Refúgio até ${availableAt}.`,
      409,
      "ARENA_PVP_OCCUPIED",
    );
  }

  const occupation = await db.arenaOccupation.findFirst({
    where: { gladiatorId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { endsAt: true },
  });
  if (!occupation) return;

  const availableAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(occupation.endsAt);
  throw new AppError(
    `Seu gladiador está ocupado até ${availableAt}. Conclua a atividade no campo de treino.`,
    409,
    "ARENA_OCCUPIED",
  );
}
