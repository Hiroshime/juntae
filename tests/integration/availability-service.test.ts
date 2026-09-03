import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createAvailabilityOverride,
  createScheduleRule,
  deleteAvailabilityOverride,
  getBestDates,
  getCommunityCalendar,
  previewScheduleRule,
  updateAvailabilityOverride,
} from "@/server/services/availability-service";

describe("availability services", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let memberId = "";
  let outsiderId = "";
  let communityId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, member, outsider] = await Promise.all([
      prisma.user.create({
        data: { email: `agenda-owner-${suffix}@test.local`, name: "Owner Agenda", passwordHash },
      }),
      prisma.user.create({
        data: {
          email: `agenda-member-${suffix}@test.local`,
          name: "Member Agenda",
          passwordHash,
          timezone: "America/New_York",
        },
      }),
      prisma.user.create({
        data: { email: `agenda-outsider-${suffix}@test.local`, name: "Outsider", passwordHash },
      }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
    const community = await prisma.community.create({
      data: {
        name: `Agenda ${suffix}`,
        slug: `agenda-${suffix}`,
        createdById: owner.id,
        members: {
          create: [
            { userId: owner.id, role: "OWNER" },
            { userId: member.id, role: "MEMBER" },
          ],
        },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.availabilityOverride.deleteMany({ where: { communityId } });
    await prisma.scheduleRule.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId, outsiderId] } } });
  });

  it("persiste ciclo 12x36 e gera prévia", async () => {
    const input = {
      name: "Plantão 12x36",
      ruleType: "CYCLE" as const,
      anchorDate: "2026-09-01",
      workDays: 1,
      restDays: 1,
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE" as const,
    };
    const schedule = await createScheduleRule(ownerId, communityId, input);
    expect(schedule.ruleType).toBe("CYCLE");
    expect(previewScheduleRule(input, "2026-09-01", "2026-09-04")).toEqual([
      { date: "2026-09-01", status: "WORKING" },
      { date: "2026-09-02", status: "DAY_OFF" },
      { date: "2026-09-03", status: "WORKING" },
      { date: "2026-09-04", status: "DAY_OFF" },
    ]);
  });

  it("faz override manual prevalecer sobre a escala", async () => {
    await createScheduleRule(ownerId, communityId, {
      name: "12x36",
      ruleType: "CYCLE",
      anchorDate: "2026-09-01",
      workDays: 1,
      restDays: 1,
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    });
    await createAvailabilityOverride(ownerId, communityId, {
      allDay: true,
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      timezone: "America/Sao_Paulo",
      status: "DAY_OFF",
      note: "Troca de plantão",
    });
    const calendar = await getCommunityCalendar(ownerId, communityId, {
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL",
    });
    expect(calendar.days[0].members.find((member) => member.id === ownerId)?.status).toBe(
      "DAY_OFF",
    );
    expect(calendar.days[1].members.find((member) => member.id === ownerId)?.status).toBe(
      "DAY_OFF",
    );
    expect(calendar.days[0].summary.totalMembers).toBe(2);
  });

  it("trata intervalo disponível como parcial no dia e completo no período", async () => {
    await createAvailabilityOverride(memberId, communityId, {
      allDay: false,
      startAt: "2026-09-01T08:00:00-04:00",
      endAt: "2026-09-01T11:00:00-04:00",
      status: "AVAILABLE",
      note: null,
    });
    const base = {
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      onlyWeekends: false,
      minPeople: 0,
    } as const;
    const fullDay = await getCommunityCalendar(ownerId, communityId, {
      ...base,
      periodOfDay: "ALL",
    });
    const morning = await getCommunityCalendar(ownerId, communityId, {
      ...base,
      periodOfDay: "MORNING",
    });
    expect(fullDay.days[0].members.find((member) => member.id === memberId)?.status).toBe(
      "PARTIALLY_AVAILABLE",
    );
    expect(morning.days[0].members.find((member) => member.id === memberId)?.status).toBe(
      "AVAILABLE",
    );
  });

  it("atualiza e remove somente ocorrência pertencente ao usuário", async () => {
    const item = await createAvailabilityOverride(ownerId, communityId, {
      allDay: true,
      startDate: "2026-09-05",
      endDate: "2026-09-05",
      timezone: "America/Sao_Paulo",
      status: "UNAVAILABLE",
      note: null,
    });
    await expect(
      updateAvailabilityOverride(memberId, communityId, item.id, {
        allDay: true,
        startDate: "2026-09-05",
        endDate: "2026-09-05",
        timezone: "America/New_York",
        status: "DAY_OFF",
        note: null,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await deleteAvailabilityOverride(ownerId, communityId, item.id);
    expect(await prisma.availabilityOverride.findUnique({ where: { id: item.id } })).toBeNull();
  });

  it("protege o calendário e ordena melhores datas com filtros", async () => {
    await createAvailabilityOverride(ownerId, communityId, {
      allDay: true,
      startDate: "2026-09-19",
      endDate: "2026-09-20",
      timezone: "America/Sao_Paulo",
      status: "AVAILABLE",
      note: null,
    });
    await createAvailabilityOverride(memberId, communityId, {
      allDay: true,
      startDate: "2026-09-20",
      endDate: "2026-09-20",
      timezone: "America/New_York",
      status: "DAY_OFF",
      note: null,
    });
    const query = {
      startDate: "2026-09-18",
      endDate: "2026-09-20",
      onlyWeekends: true,
      minPeople: 1,
      periodOfDay: "ALL" as const,
    };
    expect((await getBestDates(ownerId, communityId, query)).map((day) => day.date)).toEqual([
      "2026-09-20",
      "2026-09-19",
    ]);
    await expect(getCommunityCalendar(outsiderId, communityId, query)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("mantém todos como sem informação e retorna vazio quando o mínimo é impossível", async () => {
    const query = {
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL" as const,
    };
    const calendar = await getCommunityCalendar(ownerId, communityId, query);
    expect(calendar.days).toHaveLength(2);
    expect(calendar.days[0].summary).toMatchObject({
      fullAvailableCount: 0,
      partialAvailableCount: 0,
      workingCount: 0,
      unavailableCount: 0,
      unknownCount: 2,
      score: 0,
      totalMembers: 2,
    });
    expect(
      (
        await getCommunityCalendar(ownerId, communityId, {
          ...query,
          minPeople: 1,
        })
      ).days,
    ).toEqual([]);
  });

  it("separa contagens e permite calcular somente membros selecionados", async () => {
    await createAvailabilityOverride(ownerId, communityId, {
      allDay: true,
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      timezone: "America/Sao_Paulo",
      status: "AVAILABLE",
      note: null,
    });
    await createAvailabilityOverride(memberId, communityId, {
      allDay: true,
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      timezone: "America/New_York",
      status: "WORKING",
      note: null,
    });
    const base = {
      startDate: "2026-09-14",
      endDate: "2026-09-14",
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL" as const,
    };
    const everyone = await getCommunityCalendar(ownerId, communityId, base);
    expect(everyone.days[0].summary).toMatchObject({
      fullAvailableCount: 1,
      workingCount: 1,
      unavailableCount: 0,
      totalMembers: 2,
      score: 1,
    });

    const selected = await getCommunityCalendar(ownerId, communityId, {
      ...base,
      memberIds: [memberId],
    });
    expect(selected.totalMembers).toBe(1);
    expect(selected.days[0].members.map((member) => member.id)).toEqual([memberId]);
    expect(selected.days[0].summary).toMatchObject({
      fullAvailableCount: 0,
      workingCount: 1,
      totalMembers: 1,
      score: 0,
    });
  });
});
