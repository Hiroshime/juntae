import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  cancelEvent,
  createEvent,
  getEvent,
  listEvents,
  setEventRsvp,
  updateEvent,
} from "@/server/services/event-service";

describe("event services", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  const baseInput = {
    title: "Cinema do grupo",
    description: "Sessão noturna",
    startsAt: "2030-09-10T22:00:00.000Z",
    endsAt: "2030-09-11T01:00:00.000Z",
    allDay: false,
    timezone: "America/Sao_Paulo",
    locationName: "Cinema Central",
    locationAddress: null,
    locationUrl: null,
    estimatedCost: 35,
    currency: "BRL",
    participantLimit: null,
  };

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, admin, member, outsider] = await Promise.all(
      ["owner", "admin", "member", "outsider"].map((kind) =>
        prisma.user.create({
          data: {
            email: `event-${kind}-${suffix}@test.local`,
            name: `Event ${kind}`,
            passwordHash,
          },
        }),
      ),
    );
    ownerId = owner.id;
    adminId = admin.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await prisma.community.create({
      data: {
        name: `Events ${suffix}`,
        slug: `events-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: adminId, role: "ADMIN" },
            { userId: memberId, role: "MEMBER", displayName: "Nome na comunidade" },
          ],
        },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.event.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, adminId, memberId, outsiderId] } },
    });
  });

  it("permite que qualquer membro crie e liste eventos", async () => {
    const created = await createEvent(memberId, communityId, baseInput);
    expect(created).toMatchObject({ createdById: memberId, status: "PUBLISHED" });
    const events = await listEvents(ownerId, communityId, { scope: "UPCOMING", take: 10 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: baseInput.title, myRsvp: null });
  });

  it("não expõe eventos a quem não participa da comunidade", async () => {
    const event = await createEvent(ownerId, communityId, baseInput);
    await expect(getEvent(outsiderId, communityId, event.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      createEvent(outsiderId, communityId, { ...baseInput, title: "Intruso" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("restringe edição ao criador ou administrador e preserva cancelado", async () => {
    const event = await createEvent(memberId, communityId, baseInput);
    await expect(
      updateEvent(memberId, communityId, event.id, {
        ...baseInput,
        title: "Alterado pelo criador",
      }),
    ).resolves.toMatchObject({ title: "Alterado pelo criador" });
    await expect(
      updateEvent(adminId, communityId, event.id, {
        ...baseInput,
        title: "Alterado por admin",
      }),
    ).resolves.toMatchObject({ title: "Alterado por admin" });

    const ownerEvent = await createEvent(ownerId, communityId, {
      ...baseInput,
      title: "Evento do owner",
    });
    await expect(
      updateEvent(memberId, communityId, ownerEvent.id, { ...baseInput, title: "Sem permissão" }),
    ).rejects.toMatchObject({ status: 403 });
    await cancelEvent(adminId, communityId, ownerEvent.id);
    const cancelled = await getEvent(memberId, communityId, ownerEvent.id);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(updateEvent(ownerId, communityId, ownerEvent.id, baseInput)).rejects.toMatchObject(
      { code: "EVENT_CANCELLED" },
    );
  });

  it("substitui a resposta do membro sem duplicar RSVP", async () => {
    const event = await createEvent(ownerId, communityId, baseInput);
    await setEventRsvp(memberId, communityId, event.id, "GOING");
    await setEventRsvp(memberId, communityId, event.id, "MAYBE");
    const detail = await getEvent(memberId, communityId, event.id);
    expect(detail.myRsvp).toBe("MAYBE");
    expect(detail.rsvpSummary).toMatchObject({ GOING: 0, MAYBE: 1, totalResponses: 1 });
    expect(await prisma.eventRsvp.count({ where: { eventId: event.id, userId: memberId } })).toBe(
      1,
    );
  });

  it("não bloqueia confirmações acima do limite informado", async () => {
    const event = await createEvent(ownerId, communityId, {
      ...baseInput,
      participantLimit: 1,
    });
    await setEventRsvp(ownerId, communityId, event.id, "GOING");
    const second = await setEventRsvp(memberId, communityId, event.id, "GOING");
    expect(second).toMatchObject({ goingCount: 2, remainingSpots: 0, limitReached: true });
  });

  it("impede novas respostas depois do cancelamento sem apagar as anteriores", async () => {
    const event = await createEvent(ownerId, communityId, baseInput);
    await setEventRsvp(memberId, communityId, event.id, "GOING");
    await cancelEvent(ownerId, communityId, event.id);
    await expect(setEventRsvp(adminId, communityId, event.id, "MAYBE")).rejects.toMatchObject({
      code: "EVENT_CANCELLED",
    });
    expect(await prisma.eventRsvp.count({ where: { eventId: event.id } })).toBe(1);
  });
});
