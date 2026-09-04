import { hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getCommunityCalendar } from "@/server/services/availability-service";
import {
  createCommunityHoliday,
  deleteCommunityHoliday,
  listCommunityHolidays,
} from "@/server/services/holiday-service";

describe("community holidays", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let ownerId = "";
  let memberId = "";
  let communityId = "";

  beforeAll(async () => {
    const passwordHash = await hash("senha-de-teste", 4);
    const [owner, member] = await Promise.all([
      prisma.user.create({
        data: { email: `holiday-owner-${suffix}@test.local`, name: "Owner", passwordHash },
      }),
      prisma.user.create({
        data: { email: `holiday-member-${suffix}@test.local`, name: "Member", passwordHash },
      }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    const community = await prisma.community.create({
      data: {
        name: `Holidays ${suffix}`,
        slug: `holidays-${suffix}`,
        createdById: owner.id,
        members: { create: [{ userId: owner.id, role: "OWNER" }, { userId: member.id }] },
      },
    });
    communityId = community.id;
  });

  beforeEach(async () => {
    await prisma.communityHoliday.deleteMany({ where: { communityId } });
  });

  afterAll(async () => {
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
  });

  it("exibe feriado sem mudar automaticamente a escala do membro", async () => {
    const holiday = await createCommunityHoliday(ownerId, communityId, {
      name: "Feriado municipal",
      date: "2026-11-20",
    });
    const calendar = await getCommunityCalendar(memberId, communityId, {
      startDate: "2026-11-20",
      endDate: "2026-11-20",
      onlyWeekends: false,
      minPeople: 0,
      periodOfDay: "ALL",
    });
    expect(calendar.days[0].holidays).toEqual(["Feriado municipal"]);
    expect(calendar.days[0].members.every((member) => member.status === "UNKNOWN")).toBe(true);
    expect(await listCommunityHolidays(memberId, communityId)).toHaveLength(1);
    await deleteCommunityHoliday(ownerId, communityId, holiday.id);
    expect(await listCommunityHolidays(memberId, communityId)).toHaveLength(0);
  });

  it("impede membro comum de gerenciar feriados", async () => {
    await expect(
      createCommunityHoliday(memberId, communityId, { name: "Sem permissão", date: "2026-12-01" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
