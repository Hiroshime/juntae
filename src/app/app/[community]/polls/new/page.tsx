import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PollForm } from "@/features/polls/poll-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { getBestDates } from "@/server/services/availability-service";
import { getMembershipBySlug } from "@/server/services/community-service";

export const dynamic = "force-dynamic";

export default async function NewPollPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { community: slug } = await params;
  const user = await requirePageUser(`/app/${slug}/polls/new`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const today = civilDateInTimeZone(new Date(), user.timezone);
  const rankedDates = await getBestDates(user.id, membership.communityId, {
    startDate: today,
    endDate: addCivilDays(today, 60),
    onlyWeekends: false,
    minPeople: 0,
    periodOfDay: "ALL",
  });
  const requestedDate = (await searchParams).date;
  const preferredDate = rankedDates.find((item) => item.date === requestedDate)?.date;
  const preferredSuggestion = rankedDates.find((item) => item.date === preferredDate);
  const suggestions = preferredSuggestion
    ? [preferredSuggestion, ...rankedDates.filter((item) => item.date !== preferredDate)].slice(
        0,
        10,
      )
    : rankedDates.slice(0, 10);

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page poll-editor-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Nova votação</div>
              <h1>O que a galera prefere?</h1>
              <p className="lead">Todo membro pode criar uma votação para a comunidade.</p>
            </div>
          </div>
          <PollForm
            communityId={membership.communityId}
            communitySlug={slug}
            preferredDate={preferredDate}
            suggestions={suggestions}
            timezone={user.timezone}
          />
        </section>
      </div>
    </main>
  );
}
