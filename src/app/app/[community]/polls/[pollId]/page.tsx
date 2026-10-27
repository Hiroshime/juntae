import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { ShareActions } from "@/components/share-actions";
import { PollManagement, PollVoteForm } from "@/features/polls/poll-actions";
import { PollResults } from "@/features/polls/poll-results";
import { AddPollOptionForm } from "@/features/polls/add-poll-option-form";
import { formatPollDeadline, pollStatusLabels, pollTypeLabels } from "@/features/polls/status";
import { requirePageUser } from "@/lib/auth/page-session";
import { getMembershipBySlug } from "@/server/services/community-service";
import { getPoll } from "@/server/services/poll-service";

export const dynamic = "force-dynamic";

export default async function PollPage({
  params,
}: {
  params: Promise<{ community: string; pollId: string }>;
}) {
  const { community: slug, pollId } = await params;
  const user = await requirePageUser(`/app/${slug}/polls/${pollId}`);
  const membership = await getMembershipBySlug(user.id, slug);
  if (!membership) notFound();
  const poll = await getPoll(user.id, membership.communityId, pollId).catch(() => null);
  if (!poll) notFound();
  const sections =
    poll.type === "GROUPED"
      ? poll.questions.map((question) => ({
          ...question,
          questionId: question.id,
          options: poll.options.filter((option) => option.questionId === question.id),
        }))
      : [
          {
            id: poll.id,
            questionId: undefined,
            title: undefined,
            type: poll.type,
            canVote: poll.canVote,
            myOptionIds: poll.myOptionIds,
            totalVoters: poll.totalVoters,
            options: poll.options,
          },
        ];

  return (
    <main className="shell">
      <div className="container">
        <AppHeader user={user} community={membership.community} role={membership.role} />
        <section className="page">
          <Link className="small muted" href={`/app/${slug}/polls`}>
            ← Voltar para votações
          </Link>
          <div className="poll-detail-heading">
            <div>
              <div className="poll-heading-badges">
                <span className={`poll-status poll-status-${poll.status.toLowerCase()}`}>
                  {pollStatusLabels[poll.status]}
                </span>
                <span className="role-badge">{pollTypeLabels[poll.type]}</span>
              </div>
              <h1>{poll.title}</h1>
              {poll.event && (
                <Link href={`/app/${slug}/events/${poll.event.id}`}>
                  Evento: {poll.event.title} →
                </Link>
              )}
              {poll.description && <p className="lead">{poll.description}</p>}
              <p className="muted small">
                Criada por {poll.createdBy.name}
                {poll.closesAt && ` · prazo ${formatPollDeadline(poll.closesAt, user.timezone)}`}
              </p>
            </div>
            {poll.canManage && (
              <PollManagement
                canReopen={poll.canReopen}
                communityId={membership.communityId}
                communitySlug={slug}
                isOpen={poll.status === "OPEN"}
                pollId={poll.id}
                reopenUntilLabel={
                  poll.reopenUntil ? formatPollDeadline(poll.reopenUntil, user.timezone) : null
                }
              />
            )}
            <ShareActions
              path={`/app/${slug}/polls/${poll.id}`}
              text={`🗳️ ${poll.title}\n${poll.totalVoters} ${poll.totalVoters === 1 ? "pessoa já votou" : "pessoas já votaram"}${poll.closesAt ? `\nPrazo: ${formatPollDeadline(poll.closesAt, user.timezone)}` : ""}\n\nVote com o grupo:`}
              title={poll.title}
            />
          </div>
          {poll.type === "GROUPED" && (
            <p className="poll-question-progress">
              {poll.totalVoters}{" "}
              {poll.totalVoters === 1 ? "pessoa já participou" : "pessoas já participaram"} · Você
              respondeu{" "}
              {poll.questions.filter((question) => question.myOptionIds.length > 0).length} de{" "}
              {poll.questions.length} perguntas.
            </p>
          )}
          {sections.map((section) => (
            <section
              className="poll-question-section"
              key={section.id}
              aria-label={section.title ? `Pergunta: ${section.title}` : "Votação"}
            >
              {section.title && <h2 className="poll-question-title">{section.title}</h2>}
              <div className="poll-detail-layout">
                <div className="poll-vote-column">
                  <PollVoteForm
                    allowVoteChange={poll.allowVoteChange}
                    canVote={section.canVote}
                    communityId={membership.communityId}
                    initialOptionIds={section.myOptionIds}
                    isOpen={poll.status === "OPEN"}
                    options={section.options}
                    pollId={poll.id}
                    type={section.type}
                    questionId={section.questionId}
                    questionTitle={section.title}
                  />
                  {poll.canAddOptions && (
                    <AddPollOptionForm
                      communityId={membership.communityId}
                      pollId={poll.id}
                      questionId={section.questionId}
                      questionTitle={section.title}
                      isDate={poll.type === "DATE_OPTIONS"}
                      optionCount={section.options.length}
                    />
                  )}
                </div>
                <PollResults options={section.options} totalVoters={section.totalVoters} />
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  );
}
