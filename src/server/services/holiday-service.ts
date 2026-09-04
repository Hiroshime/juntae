import type { CommunityRole } from "@prisma/client";
import { parseCivilDate } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import type { HolidayInput } from "@/lib/validation/holiday";
import { AppError, assertFound } from "@/server/errors";

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function assertAdmin(role: CommunityRole) {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError("Apenas administradores podem gerenciar feriados.", 403, "FORBIDDEN");
  }
}

export async function listCommunityHolidays(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  return prisma.communityHoliday.findMany({
    where: { communityId },
    orderBy: [{ date: "asc" }, { name: "asc" }],
  });
}

export async function createCommunityHoliday(
  userId: string,
  communityId: string,
  input: HolidayInput,
) {
  const membership = await requireMembership(userId, communityId);
  assertAdmin(membership.role);
  const date = parseCivilDate(input.date);
  const existing = await prisma.communityHoliday.findUnique({
    where: { communityId_date_name: { communityId, date, name: input.name } },
    select: { id: true },
  });
  if (existing) throw new AppError("Este feriado já está cadastrado.", 409, "HOLIDAY_EXISTS");
  return prisma.communityHoliday.create({
    data: { communityId, createdById: userId, name: input.name, date },
  });
}

export async function deleteCommunityHoliday(
  userId: string,
  communityId: string,
  holidayId: string,
) {
  const membership = await requireMembership(userId, communityId);
  assertAdmin(membership.role);
  const holiday = assertFound(
    await prisma.communityHoliday.findFirst({ where: { id: holidayId, communityId } }),
    "Feriado não encontrado.",
  );
  await prisma.communityHoliday.delete({ where: { id: holiday.id } });
}
