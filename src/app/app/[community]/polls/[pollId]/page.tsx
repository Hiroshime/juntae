import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Avatar } from "@/components/avatar";
import { ShareActions } from "@/components/share-actions";
import { PollManagement, PollVoteForm } from "@/features/polls/poll-actions";
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
              {poll.description && <p className="lead">{poll.description}</p>}
              <p className="muted small">
                Criada por {poll.createdBy.name}
                {poll.closesAt && ` · prazo ${formatPollDeadline(poll.closesAt, user.timezone)}`}
              </p>
            </div>
            {poll.canManage && poll.status === "OPEN" && (
              <PollManagement
                communityId={membership.communityId}
                communitySlug={slug}
                pollId={poll.id}
              />
            )}
            <ShareActions
              path={`/app/${slug}/polls/${poll.id}`}
              text={`🗳️ ${poll.title}\n${poll.totalVoters} ${poll.totalVoters === 1 ? "pessoa já votou" : "pessoas já votaram"}${poll.closesAt ? `\nPrazo: ${formatPollDeadline(poll.closesAt, user.timezone)}` : ""}\n\nVote com o grupo:`}
              title={poll.title}
            />
          </div>
          <div className="poll-detail-layout">
            <PollVoteForm
              allowVoteChange={poll.allowVoteChange}
              canVote={poll.canVote}
              communityId={membership.communityId}
              initialOptionIds={poll.myOptionIds}
              isOpen={poll.status === "OPEN"}
              options={poll.options}
              pollId={poll.id}
              type={poll.type}
            />
            <section className="poll-results">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Resultado</div>
                  <h2>
                    {poll.totalVoters} {poll.totalVoters === 1 ? "votante" : "votantes"}
                  </h2>
                </div>
                <span className="muted small">Atualizado agora</span>
              </div>
              <div className="poll-result-list">
                {poll.options.map((option) => (
                  <article className="card poll-result" key={option.id}>
                    <div className="poll-result-title">
                      <strong>{option.label}</strong>
                      <span>
                        {option.voteCount} {option.voteCount === 1 ? "voto" : "votos"} ·{" "}
                        {option.percentage}%
                      </span>
                    </div>
                    <div
                      aria-label={`${option.percentage}% dos votantes`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={option.percentage}
                      className="poll-progress"
                      role="progressbar"
                    >
                      <span style={{ width: `${option.percentage}%` }} />
                    </div>
                    {option.availability && (
                      <div className="date-availability-result">
                        <span>
                          <strong>{option.availability.fullAvailableCount}</strong> disponíveis
                        </span>
                        <span>
                          <strong>{option.availability.unknownCount}</strong> sem informação
                        </span>
                        <span>
                          <strong>{option.availability.score}</strong> score
                        </span>
                      </div>
                    )}
                    <div className="poll-voters">
                      {option.voters.map((voter) => (
                        <span key={voter.userId} title={voter.name}>
                          <Avatar name={voter.name} url={voter.avatarUrl} size="small" />
                          <small>{voter.name}</small>
                        </span>
                      ))}
                      {!option.voters.length && <small className="muted">Nenhum voto ainda.</small>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
