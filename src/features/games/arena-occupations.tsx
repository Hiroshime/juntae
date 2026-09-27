"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArenaOccupationHub } from "@/server/services/arena-occupation-service";

function durationLabel(hours: number) {
  return `${hours}h`;
}

function remainingLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, "0")).join(":");
}

function completedAt(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ArenaOccupations({
  communityId,
  hasActiveBattle,
  hub,
  level,
  onChange,
  onSettled,
}: {
  communityId: string;
  hasActiveBattle: boolean;
  hub: ArenaOccupationHub;
  level: number;
  onChange: (hub: ArenaOccupationHub) => void;
  onSettled: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => new Date(hub.serverTime).getTime());
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const settlementRetryAt = useRef(0);
  const active = hub.active;

  async function refresh() {
    if (pending === "settle") return;
    setPending("settle");
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/games/arena/occupations`);
      const payload = (await response.json()) as { hub?: ArenaOccupationHub; error?: string };
      if (!response.ok || !payload.hub)
        throw new Error(payload.error || "Não foi possível concluir a atividade.");
      settlementRetryAt.current = 0;
      onChange(payload.hub);
      await onSettled();
    } catch (cause) {
      settlementRetryAt.current = Date.now() + 10_000;
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a atividade.");
    } finally {
      setPending("");
    }
  }

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (
      active &&
      new Date(active.endsAt).getTime() <= now &&
      pending !== "settle" &&
      now >= settlementRetryAt.current
    )
      void refresh();
    // `refresh` intentionally follows the current active activity and timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, now, pending]);

  const progress = useMemo(() => {
    if (!active) return 0;
    const start = new Date(active.startedAt).getTime();
    const end = new Date(active.endsAt).getTime();
    return Math.max(0, Math.min(100, ((now - start) / Math.max(1, end - start)) * 100));
  }, [active, now]);

  async function start(taskKey: string) {
    setPending(taskKey);
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/games/arena/occupations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskKey }),
      });
      const payload = (await response.json()) as { hub?: ArenaOccupationHub; error?: string };
      if (!response.ok || !payload.hub)
        throw new Error(payload.error || "Não foi possível iniciar a atividade.");
      onChange(payload.hub);
      setNow(Date.now());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a atividade.");
    } finally {
      setPending("");
    }
  }

  return (
    <section className="card arena-occupation-card" aria-labelledby="arena-occupation-title">
      <div className="card-header">
        <div>
          <div className="eyebrow">Expedições · Etapa 2</div>
          <h2 id="arena-occupation-title">Treinamento e missões</h2>
        </div>
        <span className={`pill ${active ? "arena-occupation-live" : ""}`}>
          {active ? "Em atividade" : "Disponível"}
        </span>
      </div>

      {active ? (
        <div className="arena-active-occupation" aria-live="polite">
          <div
            className={`arena-occupation-emblem ${active.kind.toLowerCase()}`}
            aria-hidden="true"
          >
            {active.kind === "TRAINING" ? "⚔" : "◈"}
          </div>
          <div className="arena-active-occupation-copy">
            <span>{active.kind === "TRAINING" ? "Treinamento" : "Missão em andamento"}</span>
            <h3>{active.task?.name ?? active.taskKey}</h3>
            <p>{active.task?.description}</p>
            <strong className="arena-occupation-countdown">
              {pending === "settle"
                ? "Recolhendo recompensas…"
                : remainingLabel(new Date(active.endsAt).getTime() - now)}
            </strong>
            <div
              aria-label={`${Math.round(progress)}% concluído`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(progress)}
              className="arena-occupation-progress"
              role="progressbar"
            >
              <i style={{ width: `${progress}%` }} />
            </div>
            <small>
              Durante a atividade, seu gladiador não pode combater, negociar, treinar atributos ou
              modificar o Refúgio.
            </small>
          </div>
        </div>
      ) : (
        <>
          {hasActiveBattle && (
            <p className="notice">
              Encerre o duelo atual para enviar seu gladiador a uma atividade.
            </p>
          )}
          <div className="arena-occupation-columns">
            {(["TRAINING", "MISSION"] as const).map((kind) => (
              <section key={kind}>
                <div className="arena-occupation-heading">
                  <span aria-hidden="true">{kind === "TRAINING" ? "⚔" : "◈"}</span>
                  <div>
                    <h3>{kind === "TRAINING" ? "Campo de treinamento" : "Quadro de missões"}</h3>
                    <p>
                      {kind === "TRAINING"
                        ? "Progresso seguro, sem incidentes."
                        : "Mais moedas e pontos, com riscos temporários."}
                    </p>
                  </div>
                </div>
                <div className="arena-task-list">
                  {hub.tasks
                    .filter((task) => task.kind === kind)
                    .map((task) => {
                      const levelLocked = level < task.requiredLevel;
                      return (
                        <article className="arena-task" key={task.key}>
                          <div>
                            <strong>{task.name}</strong>
                            <p>{task.description}</p>
                            <small>
                              {durationLabel(task.durationHours)} · +{task.rewards.experience} XP ·
                              +{task.rewards.shelterPoints} Refúgio
                              {task.rewards.gold ? ` · +${task.rewards.gold} moedas` : ""}
                              {task.riskPercent ? ` · ${task.riskPercent}% de risco` : ""}
                            </small>
                          </div>
                          <button
                            className="button secondary compact"
                            disabled={Boolean(pending) || hasActiveBattle || levelLocked}
                            onClick={() => start(task.key)}
                            type="button"
                          >
                            {pending === task.key
                              ? "Iniciando…"
                              : levelLocked
                                ? `Nível ${task.requiredLevel}`
                                : "Iniciar"}
                          </button>
                        </article>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {hub.effects.length > 0 && (
        <div className="arena-occupation-effects">
          <h3>Efeitos temporários</h3>
          {hub.effects.map((effect) => (
            <div key={`${effect.key}-${effect.expiresAt}`}>
              <strong>{effect.name}</strong>
              <span>{effect.description}</span>
              <small>Até {completedAt(effect.expiresAt)}</small>
            </div>
          ))}
        </div>
      )}

      {hub.history.length > 0 && (
        <details className="arena-occupation-history">
          <summary>Ver atividades recentes</summary>
          <ol>
            {hub.history.map((occupation) => (
              <li key={occupation.id}>
                <div>
                  <strong>{occupation.task?.name ?? occupation.taskKey}</strong>
                  <small>{completedAt(occupation.finishedAt)}</small>
                  {occupation.resultMessage && <p>{occupation.resultMessage}</p>}
                </div>
                <span>
                  +{occupation.experienceReward} XP · +{occupation.goldReward} ◈ · +
                  {occupation.shelterPointsReward} ⬢
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
