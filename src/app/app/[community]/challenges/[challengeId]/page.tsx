import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Avatar } from "@/components/avatar";
import { ShareActions } from "@/components/share-actions";
import { ChallengeActions } from "@/features/challenges/challenge-actions";
import {
  challengeScoringDescription,
  challengeStateLabels,
  formatChallengeDate,
} from "@/lib/challenges";
import { challengePageSchema } from "@/lib/validation/challenge";
import { challengePageContext } from "@/server/challenge-page";
import { AppError } from "@/server/errors";
import { getChallenge } from "@/server/services/challenge-service";
import { getChallengeActivityBoard } from "@/server/services/challenge-activity-service";
import { ActivityBoard } from "@/features/challenges/activity-board";
import { ChallengeFinalize } from "@/features/challenges/challenge-finalize";
import { getChallengeAudit } from "@/server/services/challenge-moderation-service";
import { challengeAuditLabels } from "@/lib/validation/challenge-moderation";
import { formatModalityScoring, getChallengeModalities } from "@/lib/fitness-modalities";

export default async function ChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string; challengeId: string }>;
  searchParams: Promise<{
    page?: string;
    feedPage?: string;
    rankPage?: string;
    auditPage?: string;
  }>;
}) {
  const { community: slug, challengeId } = await params;
  const { user, membership } = await challengePageContext(slug, `/${challengeId}`);
  if (!z.uuid().safeParse(challengeId).success) notFound();
  const search = await searchParams;
  const page = challengePageSchema.catch(1).parse(search.page);
  const feedPage = challengePageSchema.catch(1).parse(search.feedPage);
  const rankPage = challengePageSchema.catch(1).parse(search.rankPage);
  const auditPage = challengePageSchema.catch(1).parse(search.auditPage);
  const challenge = await getChallenge(user.id, membership.communityId, challengeId, page).catch(
    (error: unknown) => {
      if (error instanceof AppError && error.status === 404) notFound();
      throw error;
    },
  );
  const path = `/app/${slug}/challenges/${challengeId}`;
  const audit = await getChallengeAudit(user.id, membership.communityId, challengeId, auditPage);
  const board = await getChallengeActivityBoard(
    user.id,
    membership.communityId,
    challengeId,
    feedPage,
    rankPage,
  );
  return (
    <>
      <Link className="back-link" href={`/app/${slug}/challenges`}>
        ← Desafios
      </Link>
      <div className="card challenge-hero">
        <div className="eyebrow">Desafio fitness</div>
        <h1>{challenge.title}</h1>
        <div className="challenge-actions">
          <span className={`challenge-status challenge-status-${challenge.state.toLowerCase()}`}>
            {challengeStateLabels[challenge.state]}
          </span>
          {challenge.joined && <span className="pill">Você participa</span>}
        </div>
        {challenge.description && <p className="lead challenge-text">{challenge.description}</p>}
        <dl className="challenge-facts">
          <div>
            <dt>Período</dt>
            <dd>
              {formatChallengeDate(challenge.startDate)} a {formatChallengeDate(challenge.endDate)}
            </dd>
          </div>
          <div>
            <dt>Comparação dos treinos</dt>
            <dd>{challengeScoringDescription(challenge.configuration)}</dd>
          </div>
          <div>
            <dt>Organizado por</dt>
            <dd>{challenge.createdByName}</dd>
          </div>
        </dl>
        <p className="muted small">Inclui todo o último dia · Fuso: {challenge.timezone}</p>
      </div>
      <ChallengeActions challenge={challenge} communityId={membership.communityId} slug={slug} />
      {challenge.canFinalize && (
        <ChallengeFinalize
          endpoint={`/api/communities/${membership.communityId}/challenges/${challengeId}/finalize`}
        />
      )}
      {challenge.finalizedAt && (
        <p className="challenge-notice" role="status">
          Resultado consolidado por {challenge.finalizedByName} em{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            timeZone: challenge.timezone,
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(challenge.finalizedAt))}
          . A classificação final é definitiva.
        </p>
      )}
      <div className="challenge-detail-grid">
        <section className="card">
          <h2>Regras combinadas</h2>
          <p className="challenge-text">{challenge.rules}</p>
          <h3>Modalidades permitidas</h3>
          <ul className="challenge-modalities">
            {getChallengeModalities(challenge.configuration).map((item) => (
              <li key={item.id}>
                {item.label}
                {challenge.configuration.scoring.metric === "POINTS"
                  ? ` — ${formatModalityScoring(item)}`
                  : ""}
              </li>
            ))}
          </ul>
          <p>
            Até {challenge.configuration.activityRules.maxDailyActivities} treino(s) por dia ·
            mínimo de {challenge.configuration.activityRules.minDurationMinutes} minutos ·{" "}
            {challenge.configuration.activityRules.requirePhoto
              ? "foto obrigatória"
              : "foto opcional"}
            .
          </p>
          <p className="muted small">
            O combinado fica bloqueado após a primeira inscrição ou o início do desafio.
          </p>
          <ShareActions
            title={challenge.title}
            text={`Desafio: ${challenge.title}\n${formatChallengeDate(challenge.startDate)} a ${formatChallengeDate(challenge.endDate)}\nConfira as regras e participe no Juntaê. Acesso exclusivo da comunidade.`}
            path={path}
          />
        </section>
        <section className="card" aria-labelledby="challenge-participants-title">
          <h2 id="challenge-participants-title">Participantes ({challenge.participantCount})</h2>
          {challenge.participants.length ? (
            <ul className="challenge-participants">
              {challenge.participants.map((person) => (
                <li key={person.id}>
                  <Avatar name={person.name} url={person.avatarUrl} size="small" />
                  <span>
                    {person.name}
                    {person.id === user.id ? " (você)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              {challenge.participantCount
                ? "Nenhum participante nesta página."
                : "Ninguém se inscreveu ainda. A participação é voluntária, inclusive para quem criou."}
            </p>
          )}
          {(page > 1 || challenge.hasNextParticipants) && (
            <nav className="pagination" aria-label="Paginação de participantes">
              {page > 1 && (
                <Link href={`${path}?page=${page - 1}#challenge-participants-title`}>Anterior</Link>
              )}
              <span>Página {page}</span>
              {challenge.hasNextParticipants && (
                <Link href={`${path}?page=${page + 1}#challenge-participants-title`}>Próxima</Link>
              )}
            </nav>
          )}
        </section>
      </div>
      <ActivityBoard
        challenge={challenge}
        board={board}
        communityId={membership.communityId}
        path={path}
        feedPage={feedPage}
        rankPage={rankPage}
        participantPage={page}
      />
      <section
        className="card activity-section"
        id="challenge-audit"
        aria-labelledby="challenge-audit-title"
      >
        <h2 id="challenge-audit-title">Histórico de revisões</h2>
        <p className="muted small">
          Decisões e motivos ficam visíveis somente para membros da comunidade.
        </p>
        {audit.items.length ? (
          <ol className="challenge-audit-list">
            {audit.items.map((entry) => (
              <li key={entry.id}>
                <strong>{challengeAuditLabels[entry.action]}</strong>
                <p className="muted small">
                  {entry.actorName} ·{" "}
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: challenge.timezone,
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(entry.createdAt))}
                </p>
                {entry.activityTitle && (
                  <p>
                    {entry.activityTitle} · {entry.participantName}
                  </p>
                )}
                <p className="challenge-text">{entry.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Nenhuma revisão nesta página.</p>
        )}
        {(auditPage > 1 || audit.hasNext) && (
          <nav className="pagination" aria-label="Paginação do histórico">
            {auditPage > 1 && (
              <Link
                href={`${path}?page=${page}&feedPage=${feedPage}&rankPage=${rankPage}&auditPage=${auditPage - 1}#challenge-audit`}
              >
                Anterior
              </Link>
            )}
            <span>Página {auditPage}</span>
            {audit.hasNext && (
              <Link
                href={`${path}?page=${page}&feedPage=${feedPage}&rankPage=${rankPage}&auditPage=${auditPage + 1}#challenge-audit`}
              >
                Próxima
              </Link>
            )}
          </nav>
        )}
      </section>
    </>
  );
}
