import Link from "next/link";
import { challengeMetricLabels, challengeStateLabels, formatChallengeDate } from "@/lib/challenges";
import { challengePageSchema } from "@/lib/validation/challenge";
import { challengePageContext } from "@/server/challenge-page";
import { listChallenges } from "@/server/services/challenge-service";

export default async function ChallengesPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { community: slug } = await params;
  const { user, membership } = await challengePageContext(slug);
  const page = challengePageSchema.catch(1).parse((await searchParams).page);
  const result = await listChallenges(user.id, membership.communityId, page);
  const path = `/app/${slug}/challenges`;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Desafios da comunidade · Beta</div>
          <h1>Um incentivo para ir além, juntos</h1>
          <p className="lead">
            Combine as regras, reúna a turma e prepare seu próximo desafio fitness.
          </p>
        </div>
        <Link className="button" href={`${path}/new`}>
          Criar desafio
        </Link>
      </div>
      <p className="challenge-notice">
        Registre seus treinos, compartilhe fotos com a turma e acompanhe o ranking. Cada desafio tem
        suas próprias regras e limites.
      </p>
      {result.items.length ? (
        <div className="challenge-grid">
          {result.items.map((challenge) => (
            <Link
              className="card challenge-card"
              href={`${path}/${challenge.id}`}
              key={challenge.id}
            >
              <div className="card-header">
                <span
                  className={`challenge-status challenge-status-${challenge.state.toLowerCase()}`}
                >
                  {challengeStateLabels[challenge.state]}
                </span>
                <span className="muted small">
                  Fitness · {challengeMetricLabels[challenge.configuration.scoring.metric]}
                </span>
              </div>
              <h2>{challenge.title}</h2>
              <p className="muted challenge-preview">
                {challenge.description || "Uma nova meta para conquistar com a comunidade."}
              </p>
              <p>
                {formatChallengeDate(challenge.startDate)} a{" "}
                {formatChallengeDate(challenge.endDate)}
              </p>
              <div className="challenge-actions">
                <strong>{challenge.participantCount} participantes</strong>
                {challenge.joined && <span className="pill">Você participa</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card empty-state">
          <span className="empty-icon" aria-hidden="true">
            🏆
          </span>
          <h2>Nenhum desafio por aqui</h2>
          <p className="muted">
            Que tal um mês de movimento com a turma? Todos os membros podem criar e participar.
          </p>
        </div>
      )}
      {(page > 1 || result.hasNext) && (
        <nav className="pagination" aria-label="Paginação de desafios">
          {page > 1 ? (
            <Link className="button secondary" href={`${path}?page=${page - 1}`}>
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span>Página {page}</span>
          {result.hasNext && (
            <Link className="button secondary" href={`${path}?page=${page + 1}`}>
              Próxima
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
