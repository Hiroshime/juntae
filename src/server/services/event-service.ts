import { Prisma, type CommunityRole } from "@prisma/client";
import { addCivilDays, formatCivilDate, parseCivilDate } from "@/lib/dates/civil-date";
import type { CommunityCalendarEvent } from "@/lib/calendar-events";
import { prisma } from "@/lib/db/prisma";
import type { EventInput, RsvpInput } from "@/lib/validation/event";
import {
  assertEventAcceptsRsvp,
  estimatedCostPerConfirmed,
  eventAttendanceDates,
  remainingParticipantSpots,
  summarizeRsvps,
} from "@/server/domain/events";
import { AppError, assertFound } from "@/server/errors";

const eventListSelection = {
  id: true,
  communityId: true,
  createdById: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  timezone: true,
  locationName: true,
  estimatedCost: true,
  currency: true,
  participantLimit: true,
  allowMaybe: true,
  allowPartialAttendance: true,
  status: true,
  createdAt: true,
  createdBy: { select: { name: true, avatarUrl: true } },
  rsvps: { select: { userId: true, status: true } },
} satisfies Prisma.EventSelect;

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { role: true },
    }),
    "Você não participa desta comunidade.",
  );
}

function canManageEvent(actorId: string, role: CommunityRole, event: { createdById: string }) {
  return event.createdById === actorId || role === "OWNER" || role === "ADMIN";
}

function assertCanManageEvent(
  actorId: string,
  role: CommunityRole,
  event: { createdById: string },
) {
  if (!canManageEvent(actorId, role, event)) {
    throw new AppError(
      "Apenas o criador ou um administrador pode alterar este evento.",
      403,
      "FORBIDDEN",
    );
  }
}

function eventData(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    allDay: input.allDay,
    timezone: input.timezone,
    locationName: input.locationName,
    locationAddress: input.locationAddress,
    locationUrl: input.locationUrl,
    estimatedCost: input.estimatedCost,
    currency: input.currency,
    participantLimit: input.participantLimit,
    allowMaybe: input.allowMaybe,
    allowPartialAttendance: input.allowPartialAttendance,
  };
}

type EventListRecord = Prisma.EventGetPayload<{ select: typeof eventListSelection }>;

function toEventSummary(event: EventListRecord, userId: string) {
  const rsvpSummary = summarizeRsvps(event.rsvps.map((rsvp) => rsvp.status));
  const estimatedCost = event.estimatedCost?.toString() ?? null;
  return {
    ...event,
    estimatedCost,
    estimatedCostPerConfirmed: estimatedCostPerConfirmed(
      estimatedCost == null ? null : Number(estimatedCost),
      rsvpSummary.GOING,
    ),
    rsvpSummary,
    myRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
    remainingSpots: remainingParticipantSpots(event.participantLimit, rsvpSummary.GOING),
    limitReached: event.participantLimit != null && rsvpSummary.GOING >= event.participantLimit,
    rsvps: undefined,
  };
}

export async function createEvent(userId: string, communityId: string, input: EventInput) {
  await requireMembership(userId, communityId);
  return prisma.event.create({
    data: {
      ...eventData(input),
      communityId,
      createdById: userId,
      status: "PUBLISHED",
    },
  });
}

export async function listEvents(
  userId: string,
  communityId: string,
  options: { scope: "UPCOMING" | "PAST" | "ALL"; take: number; skip?: number },
) {
  await requireMembership(userId, communityId);
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      communityId,
      status: { not: "DRAFT" },
      ...(options.scope === "UPCOMING"
        ? { startsAt: { gte: now } }
        : options.scope === "PAST"
          ? { startsAt: { lt: now } }
          : {}),
    },
    orderBy: { startsAt: options.scope === "PAST" ? "desc" : "asc" },
    skip: options.skip,
    take: options.take,
    select: eventListSelection,
  });
  return events.map((event) => toEventSummary(event, userId));
}

export async function listCalendarEvents(
  userId: string,
  communityId: string,
  range: { startDate: string; endDate: string },
): Promise<CommunityCalendarEvent[]> {
  await requireMembership(userId, communityId);

  // Event dates are civil dates in the event timezone. The small UTC margin
  // keeps events near midnight from being lost before the exact date filter.
  const lowerBound = parseCivilDate(addCivilDays(range.startDate, -2));
  const upperBound = parseCivilDate(addCivilDays(range.endDate, 3));
  const events = await prisma.event.findMany({
    where: {
      communityId,
      status: { not: "DRAFT" },
      startsAt: { lt: upperBound },
      OR: [{ endsAt: null, startsAt: { gte: lowerBound } }, { endsAt: { gt: lowerBound } }],
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      timezone: true,
      status: true,
      rsvps: {
        where: { userId },
        select: {
          status: true,
          attendanceDays: { orderBy: { date: "asc" }, select: { date: true } },
        },
      },
    },
  });

  return events.flatMap((event) => {
    const eventStart = event.startsAt;
    const eventEnd = event.endsAt;
    const eventDates = eventAttendanceDates({
      startsAt: eventStart,
      endsAt: eventEnd,
      timezone: event.timezone,
    }).filter((date) => date >= range.startDate && date <= range.endDate);
    if (eventDates.length === 0) return [];

    const myRsvp = event.rsvps[0];
    return [
      {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt?.toISOString() ?? null,
        allDay: event.allDay,
        timezone: event.timezone,
        status: event.status,
        dates: eventDates,
        myRsvp: myRsvp?.status ?? null,
        myAttendanceDates: myRsvp?.attendanceDays.map((day) => formatCivilDate(day.date)) ?? [],
      },
    ];
  });
}

export async function getEvent(userId: string, communityId: string, eventId: string) {
  const membership = await requireMembership(userId, communityId);
  const event = assertFound(
    await prisma.event.findFirst({
      where: { id: eventId, communityId },
      include: {
        createdBy: { select: { name: true, avatarUrl: true } },
        rsvps: {
          orderBy: { updatedAt: "asc" },
          include: {
            attendanceDays: { orderBy: { date: "asc" } },
            user: {
              select: {
                name: true,
                avatarUrl: true,
                memberships: {
                  where: { communityId },
                  select: { displayName: true },
                },
              },
            },
          },
        },
        costShares: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, status: true },
        },
      },
    }),
    "Evento não encontrado.",
  );
  const rsvpSummary = summarizeRsvps(event.rsvps.map((rsvp) => rsvp.status));
  const estimatedCost = event.estimatedCost?.toString() ?? null;
  const myRsvp = event.rsvps.find((rsvp) => rsvp.userId === userId);
  return {
    id: event.id,
    communityId: event.communityId,
    createdById: event.createdById,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    timezone: event.timezone,
    locationName: event.locationName,
    locationAddress: event.locationAddress,
    locationUrl: event.locationUrl,
    estimatedCost,
    estimatedCostPerConfirmed: estimatedCostPerConfirmed(
      estimatedCost == null ? null : Number(estimatedCost),
      rsvpSummary.GOING,
    ),
    currency: event.currency,
    participantLimit: event.participantLimit,
    allowMaybe: event.allowMaybe,
    allowPartialAttendance: event.allowPartialAttendance,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    createdBy: event.createdBy,
    canManage: canManageEvent(userId, membership.role, event),
    myRsvp: myRsvp?.status ?? null,
    myAttendanceIsPartial: myRsvp?.attendingSpecificDays ?? false,
    myAttendanceDates: myRsvp?.attendanceDays.map((day) => formatCivilDate(day.date)) ?? [],
    attendanceDates: eventAttendanceDates(event),
    rsvpSummary,
    remainingSpots: remainingParticipantSpots(event.participantLimit, rsvpSummary.GOING),
    limitReached: event.participantLimit != null && rsvpSummary.GOING >= event.participantLimit,
    participants: event.rsvps.map((rsvp) => ({
      userId: rsvp.userId,
      status: rsvp.status,
      name: rsvp.user.memberships[0]?.displayName || rsvp.user.name,
      avatarUrl: rsvp.user.avatarUrl,
      attendingSpecificDays: rsvp.attendingSpecificDays,
      attendanceDates: rsvp.attendanceDays.map((day) => formatCivilDate(day.date)),
      updatedAt: rsvp.updatedAt,
    })),
    costShares: event.costShares,
  };
}

async function requireManageableEvent(userId: string, communityId: string, eventId: string) {
  const membership = await requireMembership(userId, communityId);
  const event = assertFound(
    await prisma.event.findFirst({ where: { id: eventId, communityId } }),
    "Evento não encontrado.",
  );
  assertCanManageEvent(userId, membership.role, event);
  return event;
}

export async function updateEvent(
  userId: string,
  communityId: string,
  eventId: string,
  input: EventInput,
) {
  const event = await requireManageableEvent(userId, communityId, eventId);
  if (event.status === "CANCELLED") {
    throw new AppError("Eventos cancelados não podem ser editados.", 409, "EVENT_CANCELLED");
  }
  if (event.status === "COMPLETED") {
    throw new AppError("Eventos concluídos não podem ser editados.", 409, "EVENT_COMPLETED");
  }
  const attendancePeriodChanged =
    event.startsAt.getTime() !== new Date(input.startsAt).getTime() ||
    event.endsAt?.getTime() !== (input.endsAt ? new Date(input.endsAt).getTime() : undefined) ||
    event.timezone !== input.timezone ||
    event.allDay !== input.allDay;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    const current = await tx.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { currency: true },
    });
    if (
      current.currency !== input.currency &&
      (await tx.eventPayment.count({ where: { eventId } }))
    ) {
      throw new AppError(
        "A moeda não pode mudar depois de registrar pagamentos no evento.",
        409,
        "ACCOUNT_HAS_PAYMENTS",
      );
    }
    const updated = await tx.event.update({ where: { id: eventId }, data: eventData(input) });
    if (!input.allowPartialAttendance || attendancePeriodChanged) {
      await tx.eventRsvpDay.deleteMany({ where: { eventId } });
      await tx.eventRsvp.updateMany({
        where: { eventId, attendingSpecificDays: true },
        data: { attendingSpecificDays: false },
      });
    }
    return updated;
  });
}

export async function cancelEvent(userId: string, communityId: string, eventId: string) {
  const event = await requireManageableEvent(userId, communityId, eventId);
  if (event.status === "COMPLETED") {
    throw new AppError("Eventos concluídos não podem ser cancelados.", 409, "EVENT_COMPLETED");
  }
  if (event.status === "CANCELLED") return event;
  return prisma.event.update({ where: { id: eventId }, data: { status: "CANCELLED" } });
}

export async function setEventRsvp(
  userId: string,
  communityId: string,
  eventId: string,
  input: RsvpInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const membership = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId, userId } },
        select: { userId: true },
      });
      if (!membership) throw new AppError("Você não participa desta comunidade.", 404, "NOT_FOUND");
      const event = assertFound(
        await tx.event.findFirst({ where: { id: eventId, communityId } }),
        "Evento não encontrado.",
      );
      try {
        assertEventAcceptsRsvp(event.status);
      } catch (error) {
        if (error instanceof Error && error.message === "EVENT_CANCELLED") {
          throw new AppError("Este evento foi cancelado.", 409, "EVENT_CANCELLED");
        }
        throw new AppError("Este evento não aceita respostas.", 409, "RSVP_CLOSED");
      }

      if (input.status === "MAYBE" && !event.allowMaybe) {
        throw new AppError(
          "A resposta “Talvez” não está habilitada neste evento.",
          409,
          "MAYBE_NOT_ALLOWED",
        );
      }

      const availableDates = eventAttendanceDates(event);
      const requestedDates = input.attendanceDates
        ? Array.from(new Set(input.attendanceDates)).sort()
        : [];
      if (requestedDates.length && !event.allowPartialAttendance) {
        throw new AppError(
          "Este evento não permite escolher dias específicos.",
          409,
          "PARTIAL_ATTENDANCE_NOT_ALLOWED",
        );
      }
      const validDates = new Set(availableDates);
      if (requestedDates.some((date) => !validDates.has(date))) {
        throw new AppError(
          "Selecione somente dias dentro do período do evento.",
          400,
          "INVALID_ATTENDANCE_DATE",
        );
      }
      const attendingSpecificDays =
        input.status !== "NOT_GOING" &&
        requestedDates.length > 0 &&
        requestedDates.length < availableDates.length;

      const rsvp = await tx.eventRsvp.upsert({
        where: { eventId_userId: { eventId, userId } },
        update: { status: input.status, attendingSpecificDays },
        create: { eventId, userId, status: input.status, attendingSpecificDays },
      });
      await tx.eventRsvpDay.deleteMany({ where: { eventId, userId } });
      if (attendingSpecificDays) {
        await tx.eventRsvpDay.createMany({
          data: requestedDates.map((date) => ({
            eventId,
            userId,
            date: new Date(`${date}T00:00:00Z`),
          })),
        });
      }
      const goingCount = await tx.eventRsvp.count({ where: { eventId, status: "GOING" } });
      return {
        rsvp,
        goingCount,
        remainingSpots: remainingParticipantSpots(event.participantLimit, goingCount),
        limitReached: event.participantLimit != null && goingCount >= event.participantLimit,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
