import { Avatar } from "@/components/avatar";
import { PollOptionContent, PollOptionLinks } from "./poll-option-card";
import type { getPoll } from "@/server/services/poll-service";

export function PollResults({
  options,
  totalVoters,
}: {
  options: Awaited<ReturnType<typeof getPoll>>["options"];
  totalVoters: number;
}) {
  return (
    <section className="poll-results">
      <div className="card-header">
        <div>
          <div className="eyebrow">Resultado</div>
          <h2>
            {totalVoters} {totalVoters === 1 ? "votante" : "votantes"}
          </h2>
        </div>
        <span className="muted small">Atualizado agora</span>
      </div>
      <div className="poll-result-list">
        {options.map((option) => (
          <article className="card poll-result" key={option.id}>
            <div className="poll-result-title">
              <PollOptionContent option={option} />
              <span>
                {option.voteCount} {option.voteCount === 1 ? "voto" : "votos"} · {option.percentage}
                %
              </span>
            </div>
            <PollOptionLinks option={option} />
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
  );
}
