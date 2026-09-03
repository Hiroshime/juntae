import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { EventForm } from "@/features/events/event-form";
import { requirePageUser } from "@/lib/auth/page-session";
import {
  addCivilDays,
  civilDateInTimeZone,
  daysBetweenCivilDates,
  parseCivilDate,
} from "@/lib/dates/civil-date";
import { getMembershipBySlug } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/events/new`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const today = civilDateInTimeZone(new Date(), user.timezone);
  const requestedDate = (await searchParams).date;
  let date = addCivilDays(today, 1);
  if (requestedDate) {
    try {
      parseCivilDate(requestedDate);
      if (requestedDate >= today && daysBetweenCivilDates(today, requestedDate) <= 366) {
        date = requestedDate;
      }
    } catch {
      // Keep the safe default when an external deep link contains an invalid civil date.
    }
  }

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page event-editor-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Novo evento</div>
              <h1>Marcar um encontro</h1>
              <p className="lead">Todo membro da comunidade pode propor um evento.</p>
            </div>
          </div>
          <EventForm
            communityId={membership.communityId}
            communitySlug={slug}
            timezone={user.timezone}
            initial={{
              title: "",
              description: "",
              startsAt: `${date}T19:00`,
              endsAt: `${date}T22:00`,
              allDay: false,
              locationName: "",
              locationAddress: "",
              locationUrl: "",
              estimatedCost: "",
              currency: "BRL",
              participantLimit: "",
            }}
          />
        </section>
      </div>
    </main>
  );
}
