import { hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getCommunityDashboard } from "@/server/services/dashboard-service";

describe("dashboard service", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, member, outsider] = await Promise.all(
      ["owner", "member", "outsider"].map((kind) =>
        prisma.user.create({
          data: {
            email: `dashboard-${kind}-${suffix}@test.local`,
            name: `Dashboard ${kind}`,
            passwordHash,
          },
        }),
      ),
    );
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await prisma.community.create({
      data: {
        name: `Dashboard ${suffix}`,
        slug: `dashboard-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: memberId, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;

    await prisma.availabilityOverride.create({
      data: {
        communityId,
        userId: memberId,
        startAt: new Date("2030-09-05T03:00:00.000Z"),
        endAt: new Date("2030-09-06T03:00:00.000Z"),
        allDay: true,
        status: "AVAILABLE",
      },
    });
    const upcomingEvent = await prisma.event.create({
      data: {
        communityId,
        createdById: ownerId,
        title: "Evento futuro do dashboard",
        startsAt: new Date("2030-09-10T22:00:00.000Z"),
        timezone: "America/Sao_Paulo",
      },
    });
    await prisma.eventRsvp.create({
      data: { eventId: upcomingEvent.id, userId: memberId, status: "GOING" },
    });
    await prisma.event.create({
      data: {
        communityId,
        createdById: ownerId,
        title: "Evento cancelado",
        startsAt: new Date("2030-09-11T22:00:00.000Z"),
        timezone: "America/Sao_Paulo",
        status: "CANCELLED",
      },
    });
    const openPoll = await prisma.poll.create({
      data: {
        communityId,
        createdById: ownerId,
        title: "Votação aberta do dashboard",
        type: "SINGLE_CHOICE",
        options: {
          create: [
            { label: "A", sortOrder: 0 },
            { label: "B", sortOrder: 1 },
          ],
        },
      },
      include: { options: true },
    });
    await prisma.pollVote.create({
      data: { pollId: openPoll.id, optionId: openPoll.options[0].id, userId: memberId },
    });
    await prisma.poll.create({
      data: {
        communityId,
        createdById: ownerId,
        title: "Votação expirada",
        type: "SINGLE_CHOICE",
        closesAt: new Date("2029-12-31T23:59:00.000Z"),
        options: {
          create: [
            { label: "A", sortOrder: 0 },
            { label: "B", sortOrder: 1 },
          ],
        },
      },
    });
    const socialPost = await prisma.socialPost.create({
      data: {
        communityId,
        authorId: memberId,
        content: "Novidade importante no feed",
        createdAt: new Date("2030-08-31T12:00:00.000Z"),
      },
    });
    await prisma.socialReaction.create({
      data: { postId: socialPost.id, userId: ownerId, type: "LIKE" },
    });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, outsiderId] } } });
  });

  it("agrega próximos itens e oportunidades sem incluir registros inativos", async () => {
    const dashboard = await getCommunityDashboard(
      memberId,
      communityId,
      "America/Sao_Paulo",
      new Date("2030-09-01T12:00:00.000Z"),
    );
    expect(dashboard.memberCount).toBe(2);
    expect(dashboard.events).toHaveLength(1);
    expect(dashboard.events[0]).toMatchObject({
      title: "Evento futuro do dashboard",
      myRsvp: "GOING",
      rsvpSummary: { GOING: 1 },
    });
    expect(dashboard.polls).toHaveLength(1);
    expect(dashboard.polls[0]).toMatchObject({
      title: "Votação aberta do dashboard",
      totalVoters: 1,
      myVoteCount: 1,
      leadingOption: { label: "A", voteCount: 1 },
    });
    expect(dashboard.socialHighlight).toMatchObject({
      content: "Novidade importante no feed",
      authorName: "Dashboard member",
      reactionCount: 1,
    });
    expect(dashboard.bestOpportunities[0]).toMatchObject({
      date: "2030-09-05",
      fullAvailableCount: 1,
      unknownCount: 1,
      score: 1,
    });
    expect(dashboard.nextSevenDays).toHaveLength(7);
    expect(dashboard.nextWeekend.saturday.date).toBe("2030-09-07");
    expect(dashboard.nextWeekend.sunday.date).toBe("2030-09-08");
  });

  it("não expõe o dashboard para quem não pertence à comunidade", async () => {
    await expect(
      getCommunityDashboard(
        outsiderId,
        communityId,
        "America/Sao_Paulo",
        new Date("2030-09-01T12:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
