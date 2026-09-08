import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EventForm } from "@/features/events/event-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { civilDateInTimeZone, dateTimeLocalInTimeZone } from "@/lib/dates/civil-date";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getEvent } from "@/server/services/event-service";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ community: string; eventId: string }>;
}) {
  const { community: slug, eventId } = await params;
  const user = await requirePageUser(`/app/${slug}/events/${eventId}/edit`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const event = await getEvent(user.id, membership.communityId, eventId).catch(() => null);
  if (!event || !event.canManage || event.status !== "PUBLISHED") notFound();
  const allDayEnd = event.endsAt ? new Date(event.endsAt.getTime() - 1) : event.startsAt;

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page event-editor-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Editar evento</div>
              <h1>{event.title}</h1>
            </div>
          </div>
          <EventForm
            communityId={membership.communityId}
            communitySlug={slug}
            eventId={event.id}
            timezone={event.timezone}
            initial={{
              title: event.title,
              description: event.description ?? "",
              startsAt: event.allDay
                ? civilDateInTimeZone(event.startsAt, event.timezone)
                : dateTimeLocalInTimeZone(event.startsAt, event.timezone),
              endsAt: event.allDay
                ? civilDateInTimeZone(allDayEnd, event.timezone)
                : event.endsAt
                  ? dateTimeLocalInTimeZone(event.endsAt, event.timezone)
                  : "",
              allDay: event.allDay,
              locationName: event.locationName ?? "",
              locationAddress: event.locationAddress ?? "",
              locationUrl: event.locationUrl ?? "",
              estimatedCost: event.estimatedCost ?? "",
              currency: event.currency,
              participantLimit: event.participantLimit?.toString() ?? "",
              allowMaybe: event.allowMaybe,
              allowPartialAttendance: event.allowPartialAttendance,
            }}
          />
        </section>
      </div>
    </main>
  );
}
