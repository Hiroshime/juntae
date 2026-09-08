import {
  Prisma,
  type AvailabilityOverride,
  type AvailabilityStatus,
  type ScheduleRule as StoredScheduleRule,
} from "@prisma/client";
import {
  addCivilDays,
  civilDateRange,
  daysBetweenCivilDates,
  formatCivilDate,
  intervalsOverlap,
  parseCivilDate,
  utcRangeForCivilDate,
  zonedDateTimeToUtc,
} from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import type {
  AvailabilityOverrideInput,
  CalendarQuery,
  ScheduleRuleInput,
} from "@/lib/validation/availability";
import {
  filterBestDates,
  rankBestDates,
  summarizeAvailability,
} from "@/server/domain/availability-scoring";
import {
  calculateScheduleAvailability,
  calculateScheduleDayAvailability,
  type ScheduleMinuteInterval,
  type ScheduleRule,
  type WeeklyPattern,
} from "@/server/domain/schedules";
import { AppError, assertFound } from "@/server/errors";

const memberSelection = {
  userId: true,
  displayName: true,
  user: { select: { name: true, avatarUrl: true, timezone: true } },
} satisfies Prisma.CommunityMemberSelect;

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { userId: true, role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function toDatabaseDate(value: string) {
  return parseCivilDate(value);
}

function timeToMinute(value: string | null) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function toDomainRule(rule: StoredScheduleRule): ScheduleRule {
  const common = {
    startDate: formatCivilDate(rule.startDate),
    endDate: rule.endDate ? formatCivilDate(rule.endDate) : undefined,
    workStartMinute: rule.workStartMinute,
    workEndMinute: rule.workEndMinute,
  };
  if (rule.ruleType === "CYCLE") {
    if (!rule.anchorDate || !rule.workDays || !rule.restDays) {
      throw new AppError("Escala cíclica inconsistente.", 500, "INVALID_SCHEDULE");
    }
    return {
      ruleType: "CYCLE",
      anchorDate: formatCivilDate(rule.anchorDate),
      workDays: rule.workDays,
      restDays: rule.restDays,
      ...common,
    };
  }
  if (!rule.weeklyPattern || Array.isArray(rule.weeklyPattern)) {
    throw new AppError("Escala semanal inconsistente.", 500, "INVALID_SCHEDULE");
  }
  return { ruleType: "WEEKLY", weeklyPattern: rule.weeklyPattern as WeeklyPattern, ...common };
}

function scheduleData(input: ScheduleRuleInput) {
  const common = {
    name: input.name,
    ruleType: input.ruleType,
    startDate: toDatabaseDate(input.startDate),
    endDate: input.endDate ? toDatabaseDate(input.endDate) : null,
    workStartMinute: timeToMinute(input.workStartTime),
    workEndMinute: timeToMinute(input.workEndTime),
    status: input.status,
  };
  if (input.ruleType === "WEEKLY") {
    return {
      ...common,
      anchorDate: null,
      workDays: null,
      restDays: null,
      weeklyPattern: input.weeklyPattern,
    };
  }
  return {
    ...common,
    anchorDate: toDatabaseDate(input.anchorDate),
    workDays: input.workDays,
    restDays: input.restDays,
    weeklyPattern: Prisma.DbNull,
  };
}

function overrideData(input: AvailabilityOverrideInput) {
  if (input.allDay) {
    return {
      allDay: true,
      startAt: zonedDateTimeToUtc(input.startDate, "00:00", input.timezone),
      endAt: zonedDateTimeToUtc(addCivilDays(input.endDate, 1), "00:00", input.timezone),
      status: input.status,
      note: input.note || null,
    };
  }
  return {
    allDay: false,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    status: input.status,
    note: input.note || null,
  };
}

export async function createScheduleRule(
  userId: string,
  communityId: string,
  input: ScheduleRuleInput,
) {
  await requireMembership(userId, communityId);
  return prisma.scheduleRule.create({
    data: { ...scheduleData(input), communityId, userId },
  });
}

export async function listScheduleRules(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  return prisma.scheduleRule.findMany({
    where: { userId, communityId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

async function requireOwnedSchedule(userId: string, communityId: string, scheduleId: string) {
  return assertFound(
    await prisma.scheduleRule.findFirst({ where: { id: scheduleId, userId, communityId } }),
    "Escala não encontrada.",
  );
}

export async function updateScheduleRule(
  userId: string,
  communityId: string,
  scheduleId: string,
  input: ScheduleRuleInput,
) {
  await requireMembership(userId, communityId);
  await requireOwnedSchedule(userId, communityId, scheduleId);
  return prisma.scheduleRule.update({
    where: { id: scheduleId },
    data: scheduleData(input),
  });
}

export async function deleteScheduleRule(userId: string, communityId: string, scheduleId: string) {
  await requireMembership(userId, communityId);
  await requireOwnedSchedule(userId, communityId, scheduleId);
  await prisma.scheduleRule.delete({ where: { id: scheduleId } });
}

export function previewScheduleRule(input: ScheduleRuleInput, startDate: string, endDate: string) {
  if (daysBetweenCivilDates(startDate, endDate) > 62) {
    throw new AppError("A prévia pode cobrir no máximo 63 dias.", 400, "RANGE_TOO_LARGE");
  }
  const rule: ScheduleRule =
    input.ruleType === "WEEKLY"
      ? {
          ruleType: "WEEKLY",
          weeklyPattern: input.weeklyPattern,
          startDate: input.startDate,
          endDate: input.endDate ?? undefined,
          workStartMinute: timeToMinute(input.workStartTime),
          workEndMinute: timeToMinute(input.workEndTime),
        }
      : {
          ruleType: "CYCLE",
          anchorDate: input.anchorDate,
          workDays: input.workDays,
          restDays: input.restDays,
          startDate: input.startDate,
          endDate: input.endDate ?? undefined,
          workStartMinute: timeToMinute(input.workStartTime),
          workEndMinute: timeToMinute(input.workEndTime),
        };
  return civilDateRange(startDate, endDate).map((date) => ({
    date,
    status: calculateScheduleAvailability(rule, date) ?? "UNKNOWN",
  }));
}

export async function createAvailabilityOverride(
  userId: string,
  communityId: string,
  input: AvailabilityOverrideInput,
) {
  await requireMembership(userId, communityId);
  return prisma.availabilityOverride.create({
    data: { ...overrideData(input), userId, communityId },
  });
}

export async function listAvailabilityOverrides(userId: string, communityId: string) {
  await requireMembership(userId, communityId);
  return prisma.availabilityOverride.findMany({
    where: { userId, communityId },
    orderBy: { startAt: "desc" },
  });
}

async function requireOwnedOverride(userId: string, communityId: string, overrideId: string) {
  return assertFound(
    await prisma.availabilityOverride.findFirst({
      where: { id: overrideId, userId, communityId },
    }),
    "Registro de disponibilidade não encontrado.",
  );
}

export async function updateAvailabilityOverride(
  userId: string,
  communityId: string,
  overrideId: string,
  input: AvailabilityOverrideInput,
) {
  await requireMembership(userId, communityId);
  await requireOwnedOverride(userId, communityId, overrideId);
  return prisma.availabilityOverride.update({
    where: { id: overrideId },
    data: overrideData(input),
  });
}

export async function deleteAvailabilityOverride(
  userId: string,
  communityId: string,
  overrideId: string,
) {
  await requireMembership(userId, communityId);
  await requireOwnedOverride(userId, communityId, overrideId);
  await prisma.availabilityOverride.delete({ where: { id: overrideId } });
}

type Member = Prisma.CommunityMemberGetPayload<{ select: typeof memberSelection }>;
const calendarPeriods = [
  "ALL",
  "MORNING",
  "AFTERNOON",
  "EVENING",
] as const satisfies readonly CalendarQuery["periodOfDay"][];

function manualStatusForDate(
  overrides: AvailabilityOverride[],
  date: string,
  timeZone: string,
  periodOfDay: CalendarQuery["periodOfDay"],
) {
  const period = utcRangeForCivilDate(date, timeZone, periodOfDay);
  const override = overrides.find((item) =>
    intervalsOverlap({ start: item.startAt, end: item.endAt }, period),
  );
  if (!override) return null;
  if (
    periodOfDay === "ALL" &&
    !override.allDay &&
    ["AVAILABLE", "DAY_OFF", "VACATION"].includes(override.status)
  ) {
    return "PARTIALLY_AVAILABLE" as const;
  }
  return override.status;
}

function statusForMemberDate(
  member: Member,
  date: string,
  periodOfDay: CalendarQuery["periodOfDay"],
  memberRules: StoredScheduleRule[],
  memberOverrides: AvailabilityOverride[],
): {
  status: AvailabilityStatus;
  schedule: {
    name: string;
    workingIntervals: ScheduleMinuteInterval[];
    freeIntervals: ScheduleMinuteInterval[];
  } | null;
} {
  const manual = manualStatusForDate(memberOverrides, date, member.user.timezone, periodOfDay);
  if (manual) return { status: manual, schedule: null };

  for (const storedRule of memberRules) {
    const calculated = calculateScheduleDayAvailability(
      toDomainRule(storedRule),
      date,
      periodOfDay,
    );
    if (calculated.status) {
      return {
        status: calculated.status,
        schedule: {
          name: storedRule.name,
          workingIntervals: calculated.workingIntervals,
          freeIntervals: calculated.freeIntervals,
        },
      };
    }
  }
  return { status: "UNKNOWN", schedule: null };
}

export async function getCommunityCalendar(
  userId: string,
  communityId: string,
  query: CalendarQuery,
) {
  await requireMembership(userId, communityId);
  const dateStart = toDatabaseDate(query.startDate);
  const dateEnd = toDatabaseDate(query.endDate);
  const scheduleLookupStart = toDatabaseDate(addCivilDays(query.startDate, -1));
  const roughOverrideStart = new Date(dateStart.getTime() - 2 * 86_400_000);
  const roughOverrideEnd = new Date(dateEnd.getTime() + 3 * 86_400_000);

  const [allMembers, rules, overrides, holidays] = await Promise.all([
    prisma.communityMember.findMany({
      where: {
        communityId,
        ...(query.memberIds?.length ? { userId: { in: query.memberIds } } : {}),
      },
      orderBy: { joinedAt: "asc" },
      select: memberSelection,
    }),
    prisma.scheduleRule.findMany({
      where: {
        communityId,
        status: "ACTIVE",
        startDate: { lte: dateEnd },
        OR: [{ endDate: null }, { endDate: { gte: scheduleLookupStart } }],
        ...(query.memberIds?.length ? { userId: { in: query.memberIds } } : {}),
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.availabilityOverride.findMany({
      where: {
        communityId,
        startAt: { lt: roughOverrideEnd },
        endAt: { gt: roughOverrideStart },
        ...(query.memberIds?.length ? { userId: { in: query.memberIds } } : {}),
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.communityHoliday.findMany({
      where: { communityId, date: { gte: dateStart, lte: dateEnd } },
      orderBy: [{ date: "asc" }, { name: "asc" }],
      select: { date: true, name: true },
    }),
  ]);

  const holidaysByDate = new Map<string, string[]>();
  for (const holiday of holidays) {
    const date = formatCivilDate(holiday.date);
    holidaysByDate.set(date, [...(holidaysByDate.get(date) ?? []), holiday.name]);
  }

  const rulesByUser = new Map<string, StoredScheduleRule[]>();
  for (const rule of rules) {
    rulesByUser.set(rule.userId, [...(rulesByUser.get(rule.userId) ?? []), rule]);
  }
  const overridesByUser = new Map<string, AvailabilityOverride[]>();
  for (const override of overrides) {
    overridesByUser.set(override.userId, [
      ...(overridesByUser.get(override.userId) ?? []),
      override,
    ]);
  }

  const days = civilDateRange(query.startDate, query.endDate).map((date) => {
    const membersByPeriod = Object.fromEntries(
      calendarPeriods.map((period) => [
        period,
        allMembers.map((member) => {
          const availability = statusForMemberDate(
            member,
            date,
            period,
            rulesByUser.get(member.userId) ?? [],
            overridesByUser.get(member.userId) ?? [],
          );
          return {
            id: member.userId,
            name: member.displayName || member.user.name,
            avatarUrl: member.user.avatarUrl,
            ...availability,
          };
        }),
      ]),
    ) as Record<
      (typeof calendarPeriods)[number],
      Array<
        ReturnType<typeof statusForMemberDate> & {
          id: string;
          name: string;
          avatarUrl: string | null;
        }
      >
    >;
    const members = membersByPeriod[query.periodOfDay];
    const periodSummaries = Object.fromEntries(
      calendarPeriods.map((period) => [
        period,
        summarizeAvailability(
          date,
          membersByPeriod[period].map((item) => item.status),
        ),
      ]),
    ) as Record<(typeof calendarPeriods)[number], ReturnType<typeof summarizeAvailability>>;
    return {
      date,
      holidays: holidaysByDate.get(date) ?? [],
      members,
      summary: periodSummaries[query.periodOfDay],
      periodSummaries,
    };
  });
  const visibleDates = new Set(
    filterBestDates(
      days.map((day) => day.summary),
      query,
    ).map((day) => day.date),
  );
  return {
    days: days.filter((day) => visibleDates.has(day.date)),
    totalMembers: allMembers.length,
  };
}

export async function getMyCalendar(userId: string, communityId: string, query: CalendarQuery) {
  return getCommunityCalendar(userId, communityId, { ...query, memberIds: [userId] });
}

export async function getBestDates(userId: string, communityId: string, query: CalendarQuery) {
  const calendar = await getCommunityCalendar(userId, communityId, query);
  return rankBestDates(calendar.days.map((day) => day.summary));
}
