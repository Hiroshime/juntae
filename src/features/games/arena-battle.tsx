"use client";

import React, { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ARENA_ACTION_DETAILS,
  ARENA_BATTLE_ACTIONS,
  type ArenaBattleAction,
  type ArenaBattleEvent,
  type ArenaOpponent,
} from "@/lib/games/arena-battle";
import {
  arenaCombatEffect,
  buildArenaAnimationCues,
  type ArenaCombatEffect as ArenaCombatEffectState,
  type ArenaFighterMotion,
} from "@/lib/games/arena-battle-animation";
import type { ArenaBattleView } from "@/server/services/arena-battle-service";
import { ArenaAvatar } from "./arena-avatar";

const ARENA_SOUND_STORAGE_KEY = "juntae-arena-sound";
let arenaAudioContext: AudioContext | null = null;

function unlockArenaAudio() {
  arenaAudioContext ??= new AudioContext();
  if (arenaAudioContext.state === "suspended") void arenaAudioContext.resume();
  return arenaAudioContext;
}

function playArenaSound(kind: ArenaBattleEvent["kind"]) {
  const context = unlockArenaAudio();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const profiles: Record<ArenaBattleEvent["kind"], [OscillatorType, number, number]> = {
    MOVE: ["sine", 120, 0.08],
    HIT: ["sawtooth", 92, 0.16],
    MISS: ["triangle", 250, 0.12],
    GUARD: ["square", 180, 0.12],
    RECOVER: ["sine", 360, 0.18],
    KNOCKOUT: ["sawtooth", 70, 0.3],
  };
  const [type, frequency, duration] = profiles[kind];
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (kind === "MISS" || kind === "RECOVER")
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 1.7,
      context.currentTime + duration,
    );
  else
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(45, frequency * 0.65),
      context.currentTime + duration,
    );
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function ResourceBar({
  label,
  value,
  maximum,
  kind,
}: {
  label: string;
  value: number;
  maximum: number;
  kind: "health" | "energy";
}) {
  const percentage = maximum ? Math.max(0, Math.min(100, (value / maximum) * 100)) : 0;
  return (
    <div className={`arena-resource ${kind}`}>
      <span>
        {label}{" "}
        <strong>
          {value}/{maximum}
        </strong>
      </span>
      <div
        aria-label={`${label}: ${value} de ${maximum}`}
        aria-valuemax={maximum}
        aria-valuemin={0}
        aria-valuenow={value}
        className="arena-resource-track"
        role="progressbar"
      >
        <i style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function OpponentSelection({
  campaignStep,
  league,
  opponents,
  previousLeague,
  pending,
  selected,
  onSelect,
  onStart,
}: {
  campaignStep: number;
  league: number;
  opponents: readonly ArenaOpponent[];
  previousLeague: { league: number; opponents: readonly ArenaOpponent[] } | null;
  pending: boolean;
  selected: string;
  onSelect: (key: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="arena-opponent-selection">
      <header className="arena-battle-heading">
        <div>
          <div className="eyebrow">Portões do Coliseu · Campanha Fase 4</div>
          <h1>Escolha seu adversário</h1>
          <p className="lead">
            Leia o estilo de cada rival. Distância, energia e ordem de iniciativa mudam cada rodada.
          </p>
        </div>
        <span className="arena-phase-badge">Combate em turnos</span>
      </header>

      <div className="arena-league-opponents" role="radiogroup" aria-label="Adversários da arena">
        <section aria-labelledby="arena-current-league-title">
          <div className="arena-league-heading">
            <div>
              <div className="eyebrow">Progressão atual</div>
              <h2 id="arena-current-league-title">Liga {league}</h2>
            </div>
            <span className="pill">Portões em sequência</span>
          </div>
          <div className="arena-opponent-grid">
            {opponents.map((opponent, index) => (
              <OpponentCard
                key={opponent.key}
                locked={index > campaignStep}
                onSelect={onSelect}
                opponent={opponent}
                selected={selected === opponent.key}
              />
            ))}
          </div>
        </section>
        {previousLeague && (
          <section aria-labelledby="arena-previous-league-title">
            <div className="arena-league-heading previous">
              <div>
                <div className="eyebrow">Treino e evolução</div>
                <h2 id="arena-previous-league-title">Revanche · Liga {previousLeague.league}</h2>
              </div>
              <span className="pill">Todos liberados</span>
            </div>
            <p className="muted arena-league-description">
              Reviva a liga anterior para acumular experiência e recursos sem alterar seu avanço
              atual.
            </p>
            <div className="arena-opponent-grid previous-league">
              {previousLeague.opponents.map((opponent) => (
                <OpponentCard
                  key={opponent.key}
                  locked={false}
                  onSelect={onSelect}
                  opponent={opponent}
                  selected={selected === opponent.key}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="arena-battle-start">
        <p className="muted">
          Seus equipamentos entram no duelo junto com você. O conjunto fica registrado até o fim da
          luta.
        </p>
        <button
          className="button arena-primary-button"
          disabled={pending}
          onClick={onStart}
          type="button"
        >
          {pending ? "Abrindo os portões…" : "Iniciar duelo"}
        </button>
      </div>
    </div>
  );
}

function OpponentCard({
  locked,
  onSelect,
  opponent,
  selected,
}: {
  locked: boolean;
  onSelect: (key: string) => void;
  opponent: ArenaOpponent;
  selected: boolean;
}) {
  return (
    <button
      aria-checked={selected}
      className={`arena-opponent-card${selected ? " selected" : ""}${locked ? " locked" : ""}${opponent.difficulty === "CHEFE" ? " boss" : ""}`}
      disabled={locked}
      onClick={() => onSelect(opponent.key)}
      role="radio"
      type="button"
    >
      <div className="arena-opponent-portrait">
        <ArenaAvatar
          appearance={opponent.appearance}
          equipment={opponent.equipment}
          fighter
          name={opponent.name}
        />
      </div>
      <span className={`arena-difficulty ${opponent.difficulty.toLowerCase()}`}>
        {opponent.difficulty === "INTERMEDIARIO"
          ? "Intermediário"
          : opponent.difficulty.toLowerCase()}
      </span>
      <span className="pill">Nível {opponent.level}</span>
      {locked && <span className="arena-opponent-lock">🔒 Portão bloqueado</span>}
      <h2>{opponent.name}</h2>
      <p className="arena-opponent-title">{opponent.title}</p>
      <blockquote>“{opponent.intro}”</blockquote>
      <dl>
        <div>
          <dt>Vida</dt>
          <dd>{opponent.derived.maxHealth}</dd>
        </div>
        <div>
          <dt>Energia</dt>
          <dd>{opponent.derived.maxEnergy}</dd>
        </div>
        <div>
          <dt>Dano</dt>
          <dd>{opponent.derived.baseDamage}</dd>
        </div>
        <div>
          <dt>Agilidade</dt>
          <dd>{opponent.attributes.agility}</dd>
        </div>
      </dl>
    </button>
  );
}

function BattleHud({ battle }: { battle: ArenaBattleView }) {
  return (
    <div className="arena-combat-hud">
      <section>
        <div className="arena-combat-name">
          <div>
            <small>Seu gladiador · nível {battle.player.level}</small>
            <h2>{battle.player.name}</h2>
          </div>
          {battle.player.guarded && <span className="pill">Em guarda</span>}
        </div>
        <ResourceBar
          kind="health"
          label="Vida"
          maximum={battle.player.derived.maxHealth}
          value={battle.player.health}
        />
        <ResourceBar
          kind="energy"
          label="Energia"
          maximum={battle.player.derived.maxEnergy}
          value={battle.player.energy}
        />
      </section>
      <div className="arena-round-medallion">
        <small>Rodada</small>
        <strong>{battle.round}</strong>
        <span>
          {battle.distance} casa{battle.distance === 1 ? "" : "s"}
        </span>
      </div>
      <section className="opponent">
        <div className="arena-combat-name">
          <div>
            <small>
              {battle.opponent.title} · nível {battle.opponent.level}
            </small>
            <h2>{battle.opponent.name}</h2>
          </div>
          {battle.opponent.guarded && <span className="pill">Em guarda</span>}
        </div>
        <ResourceBar
          kind="health"
          label="Vida"
          maximum={battle.opponent.derived.maxHealth}
          value={battle.opponent.health}
        />
        <ResourceBar
          kind="energy"
          label="Energia"
          maximum={battle.opponent.derived.maxEnergy}
          value={battle.opponent.energy}
        />
      </section>
    </div>
  );
}

type ActiveBattleAnimation = {
  id: string;
  turn: ArenaBattleView["turns"][number];
  initialGuard: { player: boolean; opponent: boolean };
};

type FighterMotionState = {
  player: ArenaFighterMotion;
  opponent: ArenaFighterMotion;
  step: number;
  effect: ArenaCombatEffectState | null;
};

const IDLE_MOTION: FighterMotionState = {
  player: "idle",
  opponent: "idle",
  step: 0,
  effect: null,
};

function CombatEffect({ effect }: { effect: ArenaCombatEffectState }) {
  return (
    <div className={`arena-combat-effect ${effect.kind}`} aria-hidden="true">
      <span className="arena-combat-effect-content">
        <i>{effect.icon}</i>
        <span>
          <strong>{effect.label}</strong>
          <small>{effect.detail}</small>
        </span>
      </span>
      <b />
      <b />
      <b />
    </div>
  );
}

function Battlefield({
  animation,
  battle,
  onAnimationComplete,
  onSound,
}: {
  animation: ActiveBattleAnimation | null;
  battle: ArenaBattleView;
  onAnimationComplete: () => void;
  onSound: (event: ArenaBattleEvent) => void;
}) {
  const [motion, setMotion] = useState<FighterMotionState>(IDLE_MOTION);
  const completionRef = useRef(onAnimationComplete);

  useEffect(() => {
    completionRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    if (!animation) {
      setMotion(IDLE_MOTION);
      return;
    }

    const activeAnimation = animation;
    const cues = buildArenaAnimationCues(activeAnimation.turn, activeAnimation.initialGuard);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer: number | undefined;
    let cueIndex = 0;

    function playNextCue() {
      const cue = cues[cueIndex];
      if (!cue) {
        setMotion(IDLE_MOTION);
        completionRef.current();
        return;
      }

      const event = activeAnimation.turn.events[cueIndex];
      setMotion({
        player: cue.player,
        opponent: cue.opponent,
        step: cueIndex + 1,
        effect: event ? arenaCombatEffect(activeAnimation.turn, event, cue) : null,
      });
      if (event) onSound(event);
      cueIndex += 1;
      timer = window.setTimeout(playNextCue, reducedMotion ? 300 : cue.duration);
    }

    playNextCue();
    return () => window.clearTimeout(timer);
  }, [animation, onSound]);

  return (
    <div
      aria-busy={Boolean(animation)}
      aria-label={`Arena: distância de ${battle.distance} casas`}
      className="arena-battlefield"
    >
      <p className="sr-only" aria-atomic="true" aria-live="polite">
        {motion.effect?.announcement ?? ""}
      </p>
      <div className="arena-crowd" aria-hidden="true" />
      <div className="arena-arches" aria-hidden="true" />
      <div className="arena-position-track" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <div
        className="arena-fighter player"
        style={{ "--fighter-position": `${battle.player.position * 10}%` } as CSSProperties}
      >
        <div
          className={`arena-fighter-avatar motion-${motion.player}${battle.player.guarded && motion.player === "idle" ? " is-guarded" : ""}${battle.status === "LOST" && motion.player === "idle" ? " is-defeated" : ""}`}
          key={`player-motion-${motion.step}`}
        >
          <ArenaAvatar
            appearance={battle.player.appearance}
            equipment={battle.player.equipment}
            fighter
            name={battle.player.name}
          />
        </div>
        {motion.effect?.actor === "PLAYER" && (
          <CombatEffect effect={motion.effect} key={`player-effect-${motion.step}`} />
        )}
      </div>
      <div
        className="arena-fighter opponent"
        style={{ "--fighter-position": `${battle.opponent.position * 10}%` } as CSSProperties}
      >
        <div
          className={`arena-fighter-avatar motion-${motion.opponent}${battle.opponent.guarded && motion.opponent === "idle" ? " is-guarded" : ""}${battle.status === "WON" && motion.opponent === "idle" ? " is-defeated" : ""}`}
          key={`opponent-motion-${motion.step}`}
        >
          <ArenaAvatar
            appearance={battle.opponent.appearance}
            equipment={battle.opponent.equipment}
            fighter
            name={battle.opponent.name}
          />
        </div>
        {motion.effect?.actor === "OPPONENT" && (
          <CombatEffect effect={motion.effect} key={`opponent-effect-${motion.step}`} />
        )}
      </div>
    </div>
  );
}

function BattleLog({ battle }: { battle: ArenaBattleView }) {
  return (
    <section className="card arena-battle-log" aria-live="polite">
      <div className="card-header">
        <div>
          <div className="eyebrow">Relato da areia</div>
          <h2>Últimas rodadas</h2>
        </div>
        <span className="pill">{battle.turns.length} registradas</span>
      </div>
      {battle.turns.length ? (
        <ol>
          {battle.turns.map((turn) => (
            <li key={turn.id}>
              <strong>Rodada {turn.round}</strong>
              <div>
                {turn.events.map((event, index) => (
                  <p className={event.actor.toLowerCase()} key={`${turn.id}-${index}`}>
                    {event.message}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Os portões fecharam. Escolha sua primeira ação.</p>
      )}
    </section>
  );
}

export function ArenaBattle({
  battle,
  campaignStep,
  communityId,
  league,
  opponents,
  previousLeague,
  onBack,
  onBattleChange,
  onFinished,
}: {
  battle: ArenaBattleView | null;
  campaignStep: number;
  communityId: string;
  league: number;
  opponents: readonly ArenaOpponent[];
  previousLeague: { league: number; opponents: readonly ArenaOpponent[] } | null;
  onBack: () => void;
  onBattleChange: (battle: ArenaBattleView | null) => void;
  onFinished: (status: ArenaBattleView["status"]) => void | Promise<void>;
}) {
  const defaultOpponentKey = opponents[campaignStep]?.key ?? opponents[0]?.key ?? "";
  const [selected, setSelected] = useState(defaultOpponentKey);
  const [pending, setPending] = useState(false);
  const [animation, setAnimation] = useState<ActiveBattleAnimation | null>(null);
  const [error, setError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);

  const finishAnimation = useCallback(() => setAnimation(null), []);

  useEffect(() => {
    if (!battle) setSelected(defaultOpponentKey);
  }, [battle, defaultOpponentKey]);

  useEffect(() => {
    setSoundEnabled(localStorage.getItem(ARENA_SOUND_STORAGE_KEY) !== "off");
  }, []);

  const playSound = useCallback(
    (event: ArenaBattleEvent) => {
      if (soundEnabled) playArenaSound(event.kind);
    },
    [soundEnabled],
  );

  function toggleSound() {
    const enabled = !soundEnabled;
    setSoundEnabled(enabled);
    localStorage.setItem(ARENA_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  }

  async function request(url: string, init: RequestInit) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, init);
      const payload = (await response.json()) as { battle?: ArenaBattleView; error?: string };
      if (!response.ok || !payload.battle)
        throw new Error(payload.error || "A arena não respondeu.");
      const previousStatus = battle?.status;
      onBattleChange(payload.battle);
      if (previousStatus === "ACTIVE" && payload.battle.status !== "ACTIVE")
        await onFinished(payload.battle.status);
      return payload.battle;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A arena não respondeu.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function start() {
    await request(`/api/communities/${communityId}/games/arena/battles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ opponentKey: selected }),
    });
  }

  async function act(action: ArenaBattleAction) {
    if (!battle || animation) return;
    if (soundEnabled) unlockArenaAudio();
    const actedRound = battle.round;
    const initialGuard = {
      player: battle.player.guarded,
      opponent: battle.opponent.guarded,
    };
    const updatedBattle = await request(
      `/api/communities/${communityId}/games/arena/battles/${battle.id}/actions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, round: actedRound }),
      },
    );
    const turn = updatedBattle?.turns.find((candidate) => candidate.round === actedRound);
    if (turn) setAnimation({ id: turn.id, turn, initialGuard });
  }

  async function abandon() {
    if (!battle || !window.confirm("Abandonar o duelo contará como derrota. Deseja continuar?"))
      return;
    await request(`/api/communities/${communityId}/games/arena/battles/${battle.id}`, {
      method: "DELETE",
    });
  }

  return (
    <div className="arena-combat-page">
      <button className="back-link button-link" onClick={onBack} type="button">
        ← Voltar à vila
      </button>
      {!battle ? (
        <OpponentSelection
          campaignStep={campaignStep}
          league={league}
          opponents={opponents}
          previousLeague={previousLeague}
          pending={pending}
          selected={selected}
          onSelect={setSelected}
          onStart={start}
        />
      ) : (
        <>
          <header className="arena-battle-heading compact-heading">
            <div>
              <div className="eyebrow">Arena dos Campeões · Duelo 1 × 1</div>
              <h1>
                {battle.status === "ACTIVE"
                  ? "A areia está em movimento"
                  : battle.status === "WON"
                    ? "Vitória na arena!"
                    : "O duelo terminou"}
              </h1>
            </div>
            <div className="arena-battle-tools">
              <button
                aria-pressed={soundEnabled}
                className="button secondary compact"
                onClick={toggleSound}
                type="button"
              >
                {soundEnabled ? "🔊 Som ligado" : "🔇 Som desligado"}
              </button>
              {battle.status === "ACTIVE" && (
                <button
                  className="button secondary compact"
                  disabled={pending || Boolean(animation)}
                  onClick={abandon}
                  type="button"
                >
                  Abandonar duelo
                </button>
              )}
            </div>
          </header>
          <BattleHud battle={battle} />
          {battle.status === "ACTIVE" && battle.player.famePenalty && (
            <section className="arena-fame-warning" role="status">
              <span aria-hidden="true">▼</span>
              <div>
                <strong>Fama negativa: o público está contra você</strong>
                <p>
                  Este duelo começou com {Math.abs(battle.player.famePenalty.maxEnergy)} a menos de
                  energia máxima e {Math.abs(battle.player.famePenalty.accuracy)} a menos de
                  precisão. Vença para recuperar sua reputação.
                </p>
              </div>
            </section>
          )}
          <Battlefield
            animation={animation}
            battle={battle}
            onAnimationComplete={finishAnimation}
            onSound={playSound}
          />

          {battle.status === "ACTIVE" ? (
            <section className="card arena-actions-panel">
              <div className="card-header">
                <div>
                  <div className="eyebrow">Seu turno</div>
                  <h2>Escolha uma ação</h2>
                </div>
                <span className="pill">Servidor autoritativo</span>
              </div>
              <div className="arena-action-grid">
                {ARENA_BATTLE_ACTIONS.map((action) => {
                  const detail = ARENA_ACTION_DETAILS[action];
                  const reason = battle.unavailableReasons[action];
                  return (
                    <button
                      className={`arena-action ${action.toLowerCase()}`}
                      disabled={pending || Boolean(animation) || Boolean(reason)}
                      key={action}
                      onClick={() => act(action)}
                      title={reason ?? detail.description}
                      type="button"
                    >
                      <strong>{detail.label}</strong>
                      <span>{detail.description}</span>
                      <small>
                        {reason ??
                          (detail.energy
                            ? `${detail.energy} energia`
                            : action === "GUARD"
                              ? "+5 energia"
                              : action === "RECOVER"
                                ? "recuperação alta"
                                : "+3 energia")}
                      </small>
                    </button>
                  );
                })}
              </div>
              {(pending || animation) && (
                <p className="arena-resolving" role="status">
                  {pending
                    ? "A arena está resolvendo a rodada…"
                    : "Os movimentos da rodada estão acontecendo…"}
                </p>
              )}
            </section>
          ) : (
            <section className={`arena-battle-result ${battle.status.toLowerCase()}`} role="status">
              <span aria-hidden="true">{battle.status === "WON" ? "♛" : "◇"}</span>
              <div>
                <div className="eyebrow">Resultado registrado</div>
                <h2>
                  {battle.status === "WON"
                    ? "Seu nome ecoa nas arquibancadas"
                    : "Toda derrota ensina um novo movimento"}
                </h2>
                <p>
                  {battle.status === "WON"
                    ? "A vitória foi adicionada à ficha do seu gladiador."
                    : "A derrota foi registrada. Escolha outro adversário quando estiver pronto."}
                </p>
                <div className="arena-reward-list" aria-label="Recompensas do duelo">
                  <span>◈ +{battle.rewards.gold} moedas</span>
                  <span>◆ +{battle.rewards.experience} experiência</span>
                  <span>
                    ★ {battle.rewards.fame >= 0 ? "+" : "−"}
                    {Math.abs(battle.rewards.fame)} fama
                  </span>
                  <span>⬢ +{battle.rewards.shelterPoints} pontos do Refúgio</span>
                  {battle.rewards.skillPoints > 0 && (
                    <span>✦ +{battle.rewards.skillPoints} pontos de atributo</span>
                  )}
                </div>
              </div>
              <button
                className="button arena-primary-button"
                onClick={() => onBattleChange(null)}
                type="button"
              >
                Escolher novo duelo
              </button>
            </section>
          )}
          <BattleLog battle={battle} />
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
