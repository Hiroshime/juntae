import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { PhotoAlbum } from "@/components/photo-album";
import { ActivityForm } from "@/features/challenges/activity-form";
import { ActivityDelete } from "@/features/challenges/activity-delete";
import { ActivityModeration } from "@/features/challenges/activity-moderation";
import { formatActivityScore } from "@/lib/challenge-activities";
import { formatChallengeDate } from "@/lib/challenges";
import { getChallengeModalities } from "@/lib/fitness-modalities";
import type { ChallengeDetail } from "@/server/services/challenge-service";
import type { ChallengeActivityBoard } from "@/server/services/challenge-activity-service";

export function ActivityBoard({
  challenge,
  board,
  communityId,
  path,
  feedPage,
  rankPage,
  participantPage,
}: {
  challenge: ChallengeDetail;
  board: ChallengeActivityBoard;
  communityId: string;
  path: string;
  feedPage: number;
  rankPage: number;
  participantPage: number;
}) {
  const href = (feed: number, rank: number, anchor: string) =>
    `${path}?page=${participantPage}&feedPage=${feed}&rankPage=${rank}#${anchor}`;
  return (
    <div className="activity-section">
      {challenge.state === "ACTIVE" && challenge.joined ? (
        <ActivityForm challenge={challenge} communityId={communityId} />
      ) : (
        <p className="challenge-notice">
          {challenge.state === "SCHEDULED"
            ? "O registro de treinos abre no primeiro dia do desafio."
            : challenge.state === "ACTIVE"
              ? "Participe do desafio para publicar seus treinos."
              : "Publicações encerradas. O feed e o ranking continuam disponíveis para consulta."}
        </p>
      )}
      <div className="activity-board-grid">
        <section id="challenge-feed" aria-labelledby="challenge-feed-title">
          <h2 id="challenge-feed-title">Feed de treinos ({board.totalActivities})</h2>
          {board.activities.length ? (
            <div className="activity-feed">
              {board.activities.map((activity) => (
                <article
                  className="card activity-card"
                  key={activity.id}
                  aria-label={activity.title}
                >
                  <div className="activity-author">
                    <Avatar name={activity.name} url={activity.avatarUrl} size="small" />
                    <div>
                      <strong>{activity.name}</strong>
                      <div className="muted small">
                        {formatChallengeDate(activity.performedOn)} ·{" "}
                        {getChallengeModalities(challenge.configuration).find(
                          (item) => item.id === activity.activityType,
                        )?.label ?? "Treino"}
                        {activity.left ? " · Saiu do desafio" : ""}
                      </div>
                    </div>
                  </div>
                  <h3>{activity.title}</h3>
                  <div className="challenge-actions">
                    <span className="pill">
                      {activity.invalidated
                        ? "Desconsiderado · não pontua"
                        : `+${formatActivityScore(activity.score, challenge.configuration.scoring.metric)}`}
                    </span>
                    <span>{formatActivityScore(activity.durationSeconds, "DURATION")}</span>
                    {activity.distanceMeters !== null && (
                      <span>{formatActivityScore(activity.distanceMeters, "DISTANCE")}</span>
                    )}
                  </div>
                  {activity.notes && <p className="challenge-text">{activity.notes}</p>}
                  {activity.invalidated && (
                    <p className="challenge-notice challenge-text">
                      Motivo: {activity.moderationReason}
                    </p>
                  )}
                  <PhotoAlbum title={activity.title} photos={activity.photos} />
                  {challenge.canModerate && (
                    <ActivityModeration
                      endpoint={`/api/communities/${communityId}/challenges/${challenge.id}/activities/${activity.id}/moderation`}
                      invalidated={activity.invalidated}
                      version={activity.moderationVersion}
                    />
                  )}
                  {activity.canDelete && (
                    <ActivityDelete
                      endpoint={`/api/communities/${communityId}/challenges/${challenge.id}/activities/${activity.id}`}
                    />
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="card empty-state">
              <h3>
                {board.totalActivities
                  ? "Nenhum treino nesta página"
                  : "O primeiro treino pode ser o seu"}
              </h3>
              <p className="muted">Os registros publicados pelo grupo aparecerão aqui.</p>
            </div>
          )}
          {(feedPage > 1 || board.hasNextFeed) && (
            <nav className="pagination" aria-label="Paginação do feed">
              {feedPage > 1 && (
                <Link href={href(feedPage - 1, rankPage, "challenge-feed")}>
                  Treinos anteriores
                </Link>
              )}
              <span>Página {feedPage}</span>
              {board.hasNextFeed && (
                <Link href={href(feedPage + 1, rankPage, "challenge-feed")}>Mais treinos</Link>
              )}
            </nav>
          )}
        </section>
        <section id="challenge-ranking" aria-labelledby="challenge-ranking-title">
          <h2 id="challenge-ranking-title">{board.finalizedAt ? "Resultado final" : "Ranking"}</h2>
          <div className="card">
            <p className="muted small">
              {board.finalizedAt
                ? "Resultado definitivo: nomes, pontuações e posições preservados na consolidação. Empates compartilham a posição."
                : "Classificação provisória: soma dos treinos não removidos nem desconsiderados de quem participa. Empates compartilham a posição. Quem sai deixa o ranking; ao voltar, recupera seus registros."}
            </p>
            {board.ranking.length ? (
              <ol className="activity-ranking">
                {board.ranking.map((person) => (
                  <li key={person.userId}>
                    <span
                      className="activity-rank-position"
                      aria-label={person.position ? `${person.position}º lugar` : "Sem pontuação"}
                    >
                      {person.position ?? "—"}
                    </span>
                    <div className="activity-rank-person">
                      <strong>{person.name}</strong>
                      <span className="muted small">{person.activityCount} treino(s)</span>
                    </div>
                    <strong>
                      {formatActivityScore(person.score, challenge.configuration.scoring.metric)}
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Nenhum participante nesta página.</p>
            )}
            {(rankPage > 1 || board.hasNextRanking) && (
              <nav className="pagination" aria-label="Paginação do ranking">
                {rankPage > 1 && (
                  <Link href={href(feedPage, rankPage - 1, "challenge-ranking")}>Anterior</Link>
                )}
                <span>Página {rankPage}</span>
                {board.hasNextRanking && (
                  <Link href={href(feedPage, rankPage + 1, "challenge-ranking")}>Próxima</Link>
                )}
              </nav>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
