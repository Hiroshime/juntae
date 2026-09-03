import { Prisma, type CommunityRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { EventInput } from "@/lib/validation/event";
import {
  assertEventAcceptsRsvp,
  estimatedCostPerConfirmed,
  remainingParticipantSpots,
  summarizeRsvps,
  type RsvpStatus,
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
      },
    }),
    "Evento não encontrado.",
  );
  const rsvpSummary = summarizeRsvps(event.rsvps.map((rsvp) => rsvp.status));
  const estimatedCost = event.estimatedCost?.toString() ?? null;
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
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    createdBy: event.createdBy,
    canManage: canManageEvent(userId, membership.role, event),
    myRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
    rsvpSummary,
    remainingSpots: remainingParticipantSpots(event.participantLimit, rsvpSummary.GOING),
    limitReached: event.participantLimit != null && rsvpSummary.GOING >= event.participantLimit,
    participants: event.rsvps.map((rsvp) => ({
      userId: rsvp.userId,
      status: rsvp.status,
      name: rsvp.user.memberships[0]?.displayName || rsvp.user.name,
      avatarUrl: rsvp.user.avatarUrl,
      updatedAt: rsvp.updatedAt,
    })),
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
  return prisma.event.update({ where: { id: eventId }, data: eventData(input) });
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
  status: RsvpStatus,
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

      const rsvp = await tx.eventRsvp.upsert({
        where: { eventId_userId: { eventId, userId } },
        update: { status },
        create: { eventId, userId, status },
      });
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
