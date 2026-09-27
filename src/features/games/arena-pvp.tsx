"use client";

import { useCallback, useEffect, useState } from "react";
import type { ArenaPvpHub } from "@/server/services/arena-pvp-service";
import { ArenaAvatar } from "./arena-avatar";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function remainingTime(endsAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return `${hours ? `${hours}h ` : ""}${String(minutes).padStart(2, "0")}m ${String(rest).padStart(2, "0")}s`;
}

function resultLabel(
  status: "ACTIVE" | "ATTACKER_WON" | "DEFENDER_WON",
  perspective: "ATTACKER" | "DEFENDER",
) {
  if (status === "ACTIVE") return perspective === "ATTACKER" ? "Saque em curso" : "Sob ataque";
  const won =
    (perspective === "ATTACKER" && status === "ATTACKER_WON") ||
    (perspective === "DEFENDER" && status === "DEFENDER_WON");
  return won ? "Vitória" : "Derrota";
}

export function ArenaPvp({
  communityId,
  hub,
  hasActiveBattle,
  hasActiveOccupation,
  onChange,
  onProfileRefresh,
}: {
  communityId: string;
  hub: ArenaPvpHub;
  hasActiveBattle: boolean;
  hasActiveOccupation: boolean;
  onChange: (hub: ArenaPvpHub) => void;
  onProfileRefresh: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/communities/${communityId}/games/arena/pvp`);
    const payload = (await response.json()) as { hub?: ArenaPvpHub; error?: string };
    if (!response.ok || !payload.hub)
      throw new Error(payload.error || "Não foi possível atualizar as disputas PvP.");
    onChange(payload.hub);
    await onProfileRefresh();
  }, [communityId, onChange, onProfileRefresh]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(
      () => {
        void refresh().catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o saque."),
        );
      },
      hub.active ? 15_000 : 30_000,
    );
    const due = hub.active
      ? window.setTimeout(
          () => {
            void refresh().catch((cause) =>
              setError(
                cause instanceof Error ? cause.message : "Não foi possível concluir o saque.",
              ),
            );
          },
          Math.max(250, new Date(hub.active.endsAt).getTime() - Date.now() + 500),
        )
      : undefined;
    return () => {
      window.clearInterval(interval);
      if (due !== undefined) window.clearTimeout(due);
    };
  }, [hub.active, refresh]);

  async function startRaid(defenderId: string, defenderName: string) {
    if (!window.confirm(`Enviar seu gladiador para saquear o Refúgio de ${defenderName}?`)) return;
    setPending(defenderId);
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/games/arena/pvp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ defenderId }),
      });
      const payload = (await response.json()) as { hub?: ArenaPvpHub; error?: string };
      if (!response.ok || !payload.hub)
        throw new Error(payload.error || "Não foi possível iniciar o saque.");
      onChange(payload.hub);
      await onProfileRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o saque.");
    } finally {
      setPending("");
    }
  }

  const blocked =
    Boolean(hub.active) || hub.condition.injured || hasActiveBattle || hasActiveOccupation;

  return (
    <div className="arena-pvp">
      <section className="card arena-pvp-intro" aria-labelledby="arena-pvp-title">
        <div>
          <div className="eyebrow">Disputas entre gladiadores · PvP</div>
          <h2 id="arena-pvp-title">Incursões aos Refúgios</h2>
          <p className="lead">
            Escolha um domínio rival. O confronto acontece automaticamente quando sua incursão
            termina, usando os atributos dos gladiadores, equipamentos, sorte e as defesas do
            Acampamento atacado. Os atributos do alvo permanecem ocultos até o resultado.
          </p>
        </div>
        <div className="arena-pvp-rules">
          <span>
            <strong>30–120 min</strong>
            <small>conforme os Refúgios</small>
          </span>
          <span>
            <strong>até ◈ 250</strong>
            <small>8% do saldo rival</small>
          </span>
          <span>
            <strong>30 min</strong>
            <small>de recuperação na derrota</small>
          </span>
        </div>
      </section>

      {hub.condition.injured && hub.condition.injuredUntil && (
        <section className="arena-pvp-injury" role="status">
          <span aria-hidden="true">✚</span>
          <div>
            <strong>Seu gladiador está machucado</strong>
            <p>Recuperação prevista até {dateTime(hub.condition.injuredUntil)}.</p>
          </div>
        </section>
      )}

      {hub.condition.famePenalty && (
        <section className="arena-fame-warning" role="status">
          <span aria-hidden="true">▼</span>
          <div>
            <strong>Fama negativa: sua incursão começa em desvantagem</strong>
            <p>
              Seu poder considera {Math.abs(hub.condition.famePenalty.maxEnergy)} a menos de energia
              e {Math.abs(hub.condition.famePenalty.accuracy)} a menos de precisão.
            </p>
          </div>
        </section>
      )}

      {hub.active && (
        <section className="card arena-pvp-active" aria-live="polite">
          <div>
            <div className="eyebrow">Incursão em andamento</div>
            <h2>Rumo ao Refúgio de {hub.active.defender.name}</h2>
            <p>
              Seu gladiador não pode duelar, treinar, negociar ou iniciar outra tarefa durante o
              saque. O resultado será calculado automaticamente.
            </p>
          </div>
          <div className="arena-pvp-countdown">
            <small>Tempo restante</small>
            <strong>{remainingTime(hub.active.endsAt, now)}</strong>
            <span>Conclusão às {dateTime(hub.active.endsAt)}</span>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="arena-pvp-targets-title">
        <div className="card-header">
          <div>
            <div className="eyebrow">Refúgios da comunidade</div>
            <h2 id="arena-pvp-targets-title">Escolha um alvo</h2>
          </div>
          <span className="pill">{hub.targets.length} disponíveis</span>
        </div>
        {hub.targets.length ? (
          <div className="arena-pvp-targets">
            {hub.targets.map((target) => (
              <article key={target.id}>
                <ArenaAvatar appearance={target.appearance} compact name={target.name} />
                <div className="arena-pvp-target-copy">
                  <div>
                    <h3>{target.name}</h3>
                    <span className="pill">Informações ocultas</span>
                  </div>
                  <p>Escolha pelo risco e pelo tempo da incursão.</p>
                  <dl>
                    <div>
                      <dt>Refúgio</dt>
                      <dd>Nível {target.shelterLevel}</dd>
                    </div>
                    <div>
                      <dt>Duração</dt>
                      <dd>{target.durationMinutes} min</dd>
                    </div>
                  </dl>
                  <button
                    className="button arena-primary-button"
                    disabled={blocked || Boolean(pending)}
                    onClick={() => startRaid(target.id, target.name)}
                    type="button"
                  >
                    {pending === target.id ? "Preparando incursão…" : "Saquear Refúgio"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Ainda não existem outros gladiadores nesta comunidade.</p>
        )}
      </section>

      <div className="arena-pvp-history-grid">
        <section className="card" aria-labelledby="arena-pvp-alerts-title">
          <div className="card-header">
            <div>
              <div className="eyebrow">Notificações de batalha</div>
              <h2 id="arena-pvp-alerts-title">Alertas do seu Refúgio</h2>
            </div>
            <span className="pill">{hub.incoming.length}</span>
          </div>
          {hub.incoming.length ? (
            <ul className="arena-pvp-log">
              {hub.incoming.map((raid) => (
                <li className={raid.status === "ACTIVE" ? "is-active" : ""} key={raid.id}>
                  <span aria-hidden="true">
                    {raid.status === "ACTIVE" ? "⚠" : raid.status === "DEFENDER_WON" ? "♜" : "◇"}
                  </span>
                  <div>
                    <strong>
                      {resultLabel(raid.status, "DEFENDER")} contra {raid.attacker.name}
                    </strong>
                    <small>
                      {raid.status === "ACTIVE"
                        ? `Conclusão automática às ${dateTime(raid.endsAt)}`
                        : `${dateTime(raid.resolvedAt ?? raid.endsAt)} · ${raid.goldStolen ? `◈ ${raid.goldStolen} saqueadas` : "nenhuma moeda perdida"}`}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nenhum gladiador atacou seu Refúgio.</p>
          )}
        </section>

        <section className="card" aria-labelledby="arena-pvp-history-title">
          <div className="card-header">
            <div>
              <div className="eyebrow">Registro de incursões</div>
              <h2 id="arena-pvp-history-title">Seus saques recentes</h2>
            </div>
          </div>
          {hub.outgoing.length ? (
            <ul className="arena-pvp-log">
              {hub.outgoing.map((raid) => (
                <li key={raid.id}>
                  <span aria-hidden="true">{raid.status === "ATTACKER_WON" ? "⚔" : "✚"}</span>
                  <div>
                    <strong>
                      {resultLabel(raid.status, "ATTACKER")} contra {raid.defender.name}
                    </strong>
                    <small>
                      +{raid.experienceReward} XP ·{" "}
                      {raid.goldStolen ? `+◈ ${raid.goldStolen}` : "sem saque"}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Você ainda não realizou nenhuma incursão.</p>
          )}
        </section>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
