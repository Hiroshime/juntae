import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  cancelEvent,
  createEvent,
  getEvent,
  listCalendarEvents,
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
    allowMaybe: true,
    allowPartialAttendance: false,
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

  it("projeta eventos nas datas civis e traz o RSVP do usuário atual", async () => {
    const event = await createEvent(ownerId, communityId, {
      ...baseInput,
      title: "Chácara de novembro",
      startsAt: "2030-11-20T03:00:00.000Z",
      endsAt: "2030-11-24T03:00:00.000Z",
      allDay: true,
      allowPartialAttendance: true,
    });
    await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: ["2030-11-22", "2030-11-23"],
    });

    const events = await listCalendarEvents(memberId, communityId, {
      startDate: "2030-11-21",
      endDate: "2030-11-23",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Chácara de novembro",
      dates: ["2030-11-21", "2030-11-22", "2030-11-23"],
      myRsvp: "GOING",
      myAttendanceDates: ["2030-11-22", "2030-11-23"],
    });
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
    await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: null,
    });
    await setEventRsvp(memberId, communityId, event.id, {
      status: "MAYBE",
      attendanceDates: null,
    });
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
    await setEventRsvp(ownerId, communityId, event.id, {
      status: "GOING",
      attendanceDates: null,
    });
    const second = await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: null,
    });
    expect(second).toMatchObject({ goingCount: 2, remainingSpots: 0, limitReached: true });
    const detail = await getEvent(ownerId, communityId, event.id);
    expect(detail.estimatedCostPerConfirmed).toBe(17.5);
  });

  it("impede novas respostas depois do cancelamento sem apagar as anteriores", async () => {
    const event = await createEvent(ownerId, communityId, baseInput);
    await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: null,
    });
    await cancelEvent(ownerId, communityId, event.id);
    await expect(
      setEventRsvp(adminId, communityId, event.id, {
        status: "MAYBE",
        attendanceDates: null,
      }),
    ).rejects.toMatchObject({ code: "EVENT_CANCELLED" });
    expect(await prisma.eventRsvp.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("aplica a configuração de talvez e persiste participação em dias específicos", async () => {
    const event = await createEvent(ownerId, communityId, {
      ...baseInput,
      startsAt: "2030-11-20T03:00:00.000Z",
      endsAt: "2030-11-24T03:00:00.000Z",
      allDay: true,
      allowMaybe: false,
      allowPartialAttendance: true,
    });

    await expect(
      setEventRsvp(memberId, communityId, event.id, {
        status: "MAYBE",
        attendanceDates: null,
      }),
    ).rejects.toMatchObject({ code: "MAYBE_NOT_ALLOWED" });
    await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: ["2030-11-22", "2030-11-23"],
    });

    const detail = await getEvent(memberId, communityId, event.id);
    expect(detail).toMatchObject({
      attendanceDates: ["2030-11-20", "2030-11-21", "2030-11-22", "2030-11-23"],
      myAttendanceIsPartial: true,
      myAttendanceDates: ["2030-11-22", "2030-11-23"],
    });
    expect(detail.participants[0]).toMatchObject({
      attendingSpecificDays: true,
      attendanceDates: ["2030-11-22", "2030-11-23"],
    });
  });

  it("rejeita dias externos e limpa seleções ao desabilitar presença parcial", async () => {
    const multiDayInput = {
      ...baseInput,
      startsAt: "2030-11-20T03:00:00.000Z",
      endsAt: "2030-11-24T03:00:00.000Z",
      allDay: true,
      allowPartialAttendance: true,
    };
    const event = await createEvent(ownerId, communityId, multiDayInput);
    await expect(
      setEventRsvp(memberId, communityId, event.id, {
        status: "GOING",
        attendanceDates: ["2030-11-25"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ATTENDANCE_DATE" });
    await setEventRsvp(memberId, communityId, event.id, {
      status: "GOING",
      attendanceDates: ["2030-11-22"],
    });

    await updateEvent(ownerId, communityId, event.id, {
      ...multiDayInput,
      allowPartialAttendance: false,
    });
    expect(await prisma.eventRsvpDay.count({ where: { eventId: event.id } })).toBe(0);
    expect((await getEvent(memberId, communityId, event.id)).myAttendanceIsPartial).toBe(false);
  });
});
