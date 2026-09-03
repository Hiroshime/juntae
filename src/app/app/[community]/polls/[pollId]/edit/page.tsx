import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PollSettingsForm } from "@/features/polls/poll-actions";
import { requirePageUser } from "@/lib/auth/page-session";
import { dateTimeLocalInTimeZone } from "@/lib/dates/civil-date";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getPoll } from "@/server/services/poll-service";

export const dynamic = "force-dynamic";

export default async function EditPollPage({
  params,
}: {
  params: Promise<{ community: string; pollId: string }>;
}) {
  const { community: slug, pollId } = await params;
  const user = await requirePageUser(`/app/${slug}/polls/${pollId}/edit`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const poll = await getPoll(user.id, membership.communityId, pollId).catch(() => null);
  if (!poll || !poll.canManage || poll.status !== "OPEN") notFound();

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page poll-editor-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">Editar votação</div>
              <h1>{poll.title}</h1>
            </div>
          </div>
          <PollSettingsForm
            communityId={membership.communityId}
            communitySlug={slug}
            pollId={poll.id}
            timezone={user.timezone}
            initial={{
              title: poll.title,
              description: poll.description ?? "",
              allowVoteChange: poll.allowVoteChange,
              closesAt: poll.closesAt ? dateTimeLocalInTimeZone(poll.closesAt, user.timezone) : "",
            }}
          />
        </section>
      </div>
    </main>
  );
}
