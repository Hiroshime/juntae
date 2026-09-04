import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ScheduleManager } from "@/features/availability/schedule-manager";
import { ScheduleExceptions } from "@/features/availability/schedule-exceptions";
import { civilDateInTimeZone, formatCivilDate } from "@/lib/dates/civil-date";
import { requirePageUser } from "@/lib/auth/page-session";
import {
  listAvailabilityOverrides,
  listScheduleRules,
} from "@/server/services/availability-service";
import { getMembershipBySlug } from "@/server/services/community-service";
import { listCommunityHolidays } from "@/server/services/holiday-service";

export const dynamic = "force-dynamic";

export default async function SchedulesPage({
  params,
}: {
  params: Promise<{ community: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/agenda/schedules`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const [schedules, holidays, overrides] = await Promise.all([
    listScheduleRules(user.id, membership.communityId),
    listCommunityHolidays(user.id, membership.communityId),
    listAvailabilityOverrides(user.id, membership.communityId),
  ]);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Escalas recorrentes</div>
              <h1>Minha rotina de trabalho</h1>
              <p className="lead">
                Configure semana padrão, 12×36, 4×2 ou qualquer alternância entre trabalho e folga.
              </p>
            </div>
          </div>
          <ScheduleManager
            communityId={membership.communityId}
            initialDate={civilDateInTimeZone(new Date(), user.timezone)}
            holidays={holidays.map((holiday) => ({
              date: formatCivilDate(holiday.date),
              name: holiday.name,
            }))}
            schedules={schedules.map((rule) => ({
              id: rule.id,
              name: rule.name,
              ruleType: rule.ruleType,
              anchorDate: rule.anchorDate ? formatCivilDate(rule.anchorDate) : null,
              workDays: rule.workDays,
              restDays: rule.restDays,
              weeklyPattern: rule.weeklyPattern as Record<string, "WORKING" | "DAY_OFF"> | null,
              startDate: formatCivilDate(rule.startDate),
              endDate: rule.endDate ? formatCivilDate(rule.endDate) : null,
              status: rule.status,
            }))}
          />
          <ScheduleExceptions
            canManageHolidays={membership.role === "OWNER" || membership.role === "ADMIN"}
            communityId={membership.communityId}
            extraDays={overrides
              .filter((override) => override.allDay && override.status === "DAY_OFF")
              .map((override) => ({
                id: override.id,
                startAt: override.startAt.toISOString(),
                endAt: override.endAt.toISOString(),
                note: override.note,
              }))}
            holidays={holidays.map((holiday) => ({
              id: holiday.id,
              date: formatCivilDate(holiday.date),
              name: holiday.name,
            }))}
            initialDate={civilDateInTimeZone(new Date(), user.timezone)}
            timezone={user.timezone}
          />
        </section>
      </div>
    </main>
  );
}
