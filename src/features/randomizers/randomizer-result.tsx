import type { RandomizerResult } from "@/lib/randomizer";

export function RandomizerResultView({ result }: { result: RandomizerResult }) {
  if (result.kind === "GROUPS") {
    return (
      <div className="randomizer-group-grid">
        {result.groups.map((group) => (
          <article className="randomizer-result-group" key={group.id}>
            <h3>{group.label}</h3>
            <ol>
              {group.members.map((member) => (
                <li key={member.id}>
                  <span className="randomizer-person-mark">{member.label.charAt(0)}</span>
                  <strong>{member.label}</strong>
                  {group.captainId === member.id && <span className="pill">Capitão</span>}
                </li>
              ))}
            </ol>
          </article>
        ))}
        {result.unassigned?.length ? (
          <article className="randomizer-result-group unassigned">
            <h3>Sem par</h3>
            <ol>
              {result.unassigned.map((entry) => (
                <li key={entry.id}>
                  <span className="randomizer-person-mark">{entry.label.charAt(0)}</span>
                  <strong>{entry.label}</strong>
                </li>
              ))}
            </ol>
          </article>
        ) : null}
      </div>
    );
  }

  if (result.kind === "ASSIGNMENTS") {
    return (
      <div className="randomizer-assignment-list">
        {result.assignments.map(({ participant, item }) => (
          <div key={participant.id}>
            <strong>{participant.label}</strong>
            <span aria-hidden="true">→</span>
            <strong>{item.label}</strong>
          </div>
        ))}
      </div>
    );
  }

  if (result.kind === "ORDER") {
    return (
      <ol className="randomizer-order-list">
        {result.ordered.map((entry, index) => (
          <li key={entry.id}>
            <span>{index + 1}</span>
            <strong>{entry.label}</strong>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="randomizer-selection">
      {result.selected.map((entry) => (
        <strong key={entry.id}>⭐ {entry.label}</strong>
      ))}
    </div>
  );
}
