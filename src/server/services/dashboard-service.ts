import { Prisma } from "@prisma/client";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { prisma } from "@/lib/db/prisma";
import { summarizeRsvps } from "@/server/domain/events";
import { nextWeekendDates, selectBestOpportunities } from "@/server/domain/dashboard";
import { summarizePollResults } from "@/server/domain/polls";
import { assertFound } from "@/server/errors";
import { getCommunityCalendar } from "@/server/services/availability-service";
import { findSocialHighlight } from "@/server/services/social-service";

const upcomingEventSelection = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  timezone: true,
  locationName: true,
  participantLimit: true,
  rsvps: { select: { userId: true, status: true } },
} satisfies Prisma.EventSelect;

const openPollSelection = {
  id: true,
  title: true,
  type: true,
  closesAt: true,
  options: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      label: true,
      votes: { select: { userId: true } },
    },
  },
} satisfies Prisma.PollSelect;

async function requireMembership(userId: string, communityId: string) {
  return assertFound(
    await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { userId: true },
    }),
    "Você não participa desta comunidade.",
  );
}

export async function getCommunityDashboard(
  userId: string,
  communityId: string,
  timezone: string,
  now = new Date(),
) {
  await requireMembership(userId, communityId);
  const today = civilDateInTimeZone(now, timezone);
  const calendarEnd = addCivilDays(today, 29);
  const [storedEvents, storedPolls, calendar, socialHighlight] = await Promise.all([
    prisma.event.findMany({
      where: {
        communityId,
        startsAt: { gte: now },
        status: "PUBLISHED",
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: upcomingEventSelection,
    }),
    prisma.poll.findMany({
      where: {
        communityId,
        status: "OPEN",
        OR: [{ closesAt: null }, { closesAt: { gt: now } }],
      },
      orderBy: [{ closesAt: "asc" }, { createdAt: "desc" }],
      take: 3,
      select: openPollSelection,
    }),
    getCommunityCalendar(userId, communityId, {
      startDate: today,
      endDate: calendarEnd,
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL",
    }),
    findSocialHighlight(communityId),
  ]);

  const events = storedEvents.map((event) => {
    const rsvpSummary = summarizeRsvps(event.rsvps.map((rsvp) => rsvp.status));
    return {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      timezone: event.timezone,
      locationName: event.locationName,
      participantLimit: event.participantLimit,
      rsvpSummary,
      myRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
    };
  });
  const polls = storedPolls.map((poll) => {
    const results = summarizePollResults(poll.options);
    const leadingOption =
      poll.options
        .map((option) => ({ label: option.label, voteCount: option.votes.length }))
        .sort((first, second) => second.voteCount - first.voteCount)[0] ?? null;
    return {
      id: poll.id,
      title: poll.title,
      type: poll.type,
      closesAt: poll.closesAt,
      totalVoters: results.totalVoters,
      myVoteCount: poll.options.reduce(
        (count, option) => count + option.votes.filter((vote) => vote.userId === userId).length,
        0,
      ),
      leadingOption,
    };
  });
  const summaries = calendar.days.map((day) => day.summary);
  const weekendDates = nextWeekendDates(today);
  const summaryByDate = new Map(summaries.map((summary) => [summary.date, summary]));

  return {
    today,
    memberCount: calendar.totalMembers,
    events,
    polls,
    socialHighlight,
    bestOpportunities: selectBestOpportunities(summaries, 3),
    nextSevenDays: summaries.filter((summary) => summary.date <= addCivilDays(today, 6)),
    nextWeekend: {
      saturday: summaryByDate.get(weekendDates.saturday)!,
      sunday: summaryByDate.get(weekendDates.sunday)!,
    },
  };
}
