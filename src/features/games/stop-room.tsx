"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STOP_ALPHABET } from "@/lib/games/stop-game";
import type { GameRoomAction, StopGameAction, StopRules } from "@/lib/validation/games";
import type { GameRoomDetail } from "@/server/services/game-service";
import { RoomLobbyPlayers } from "./room-lobby-players";
import { useRoomDeparture } from "./use-room-departure";

function secondsLeft(deadline: string, now: number) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1_000));
}

function announcement(room: GameRoomDetail) {
  const session = room.stop.currentSession;
  const round = session?.currentRound;
  if (round?.status === "ANSWERING")
    return round.bonusActive
      ? `Tempo extra! Mais 10 segundos para respostas com a letra ${round.letter}.`
      : `Rodada ${round.roundNumber}: respostas com a letra ${round.letter}.`;
  if (round?.status === "REVIEWING") {
    const category = session?.categories[round.reviewCategoryIndex];
    return `Revisando ${category?.name ?? "as respostas"}, categoria por categoria.`;
  }
  const last = room.stop.lastSession;
  if (last?.status === "FINISHED") {
    const winners = last.players.filter((player) => player.winner).map((player) => player.name);
    return winners.length > 1
      ? `Empate entre ${winners.join(" e ")}.`
      : `${winners[0] ?? "A turma"} venceu a partida.`;
  }
  return room.players.length < 2
    ? "Aguardando ao menos mais um jogador."
    : "Marquem pronto para começar.";
}

export function StopRoom({
  communityId,
  communitySlug,
  initialRoom,
}: {
  communityId: string;
  communitySlug: string;
  initialRoom: GameRoomDetail;
}) {
  const [room, setRoom] = useState(initialRoom);
  const initialRules = initialRoom.rules as StopRules;
  const [rules, setRules] = useState<StopRules>(initialRules);
  const [newCategory, setNewCategory] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const autoJoinAttempted = useRef(false);
  const lastSavedRef = useRef("");
  const baseUrl = `/api/communities/${communityId}/games/rooms/${room.id}`;
  const { markDeparted } = useRoomDeparture(`${baseUrl}/actions`, room.viewer.isPlayer);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { room: GameRoomDetail };
      setRoom((current) => (payload.room.version > current.version ? payload.room : current));
    } catch {
      // A próxima consulta tenta novamente.
    }
  }, [baseUrl]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (document.visibilityState === "visible" && !pending) await refresh();
      if (!cancelled) timer = window.setTimeout(poll, room.status === "PLAYING" ? 500 : 900);
    };
    timer = window.setTimeout(poll, 500);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, refresh, room.status]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const commonAction = useCallback(
    async (action: GameRoomAction) => {
      setPending(true);
      setError("");
      try {
        const response = await fetch(`${baseUrl}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        });
        const payload = (await response.json()) as { room?: GameRoomDetail; error?: string };
        if (!response.ok || !payload.room) throw new Error(payload.error || "Ação não concluída.");
        setRoom(payload.room);
        setRules(payload.room.rules as StopRules);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
        await refresh();
        return false;
      } finally {
        setPending(false);
      }
    },
    [baseUrl, refresh],
  );

  const stopAction = useCallback(
    async (action: StopGameAction, background = false) => {
      if (background) setSaving(true);
      else setPending(true);
      if (!background) setError("");
      try {
        const response = await fetch(`${baseUrl}/stop/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action),
        });
        const payload = (await response.json()) as { room?: GameRoomDetail; error?: string };
        if (!response.ok || !payload.room) throw new Error(payload.error || "Ação não concluída.");
        setRoom(payload.room);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
        await refresh();
        return false;
      } finally {
        if (background) setSaving(false);
        else setPending(false);
      }
    },
    [baseUrl, refresh],
  );

  useEffect(() => {
    if (autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    if (room.viewer.canJoin) void commonAction({ action: "JOIN" });
  }, [commonAction, room.viewer.canJoin]);

  const session = room.stop.currentSession;
  const lastSession = room.stop.lastSession;
  const round = session?.currentRound;

  useEffect(() => {
    if (!session || !round || round.status !== "ANSWERING") return;
    const own = Object.fromEntries(
      session.categories.map((category) => [
        category.id,
        round.answers.find(
          (answer) => answer.categoryId === category.id && answer.userId === room.viewer.userId,
        )?.value ?? "",
      ]),
    );
    setAnswers(own);
    lastSavedRef.current = JSON.stringify(own);
    setSaved(true);
  }, [room.viewer.userId, round, session]);

  const answerPayload = useMemo(
    () =>
      session?.categories.map((category) => ({
        categoryId: category.id,
        value: answers[category.id] ?? "",
      })) ?? [],
    [answers, session?.categories],
  );

  const saveAnswers = useCallback(async () => {
    if (!round || round.status !== "ANSWERING") return false;
    const serialized = JSON.stringify(answers);
    if (serialized === lastSavedRef.current) return true;
    const ok = await stopAction(
      { action: "SAVE_ANSWERS", roundId: round.id, answers: answerPayload },
      true,
    );
    if (ok) {
      lastSavedRef.current = serialized;
      setSaved(true);
    }
    return ok;
  }, [answerPayload, answers, round, stopAction]);

  useEffect(() => {
    if (!round || round.status !== "ANSWERING") return;
    const serialized = JSON.stringify(answers);
    if (serialized === lastSavedRef.current) return;
    setSaved(false);
    const timer = window.setTimeout(() => void saveAnswers(), 700);
    return () => window.clearTimeout(timer);
  }, [answers, round, saveAnswers]);

  async function pressStop() {
    if (!round) return;
    if (!(await saveAnswers())) return;
    await stopAction({ action: "STOP_ROUND", roundId: round.id });
  }

  async function leaveRoom() {
    if (!(await commonAction({ action: "LEAVE" }))) return;
    markDeparted();
    window.location.assign(`/app/${communitySlug}/games`);
  }

  function toggleLetter(letter: string) {
    setRules((current) => ({
      ...current,
      letters: current.letters.includes(letter)
        ? current.letters.filter((item) => item !== letter)
        : [...current.letters, letter].sort(),
    }));
  }

  function addCategory() {
    const value = newCategory.replace(/\s+/g, " ").trim();
    if (!value || rules.categories.length >= 20) return;
    setRules((current) => ({ ...current, categories: [...current.categories, value] }));
    setNewCategory("");
  }

  const currentCategory =
    round?.status === "REVIEWING" ? session?.categories[round.reviewCategoryIndex] : null;
  const displayedSession = session ?? lastSession;
  const displayedPlayers =
    displayedSession?.players ??
    room.players.map((player) => ({ ...player, seat: player.seat, score: 0, winner: false }));
  const finalWinners = lastSession?.players.filter((player) => player.winner) ?? [];
  const persistedRules = room.rules as StopRules;
  const activeDeadline = round?.bonusActive ? round.bonusDeadline : round?.answerDeadline;
  const remaining = activeDeadline ? secondsLeft(activeDeadline, now) : 0;
  const reviewRemaining = round?.reviewDeadline ? secondsLeft(round.reviewDeadline, now) : 0;

  useEffect(() => {
    if (round?.status !== "ANSWERING" || remaining > 2 || saved || saving) return;
    void saveAnswers();
  }, [remaining, round?.status, saveAnswers, saved, saving]);

  return (
    <>
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
      </Link>
      <div className="page-heading game-room-heading stop-room-heading">
        <div>
          <div className="eyebrow">Stop da Turma · Sala</div>
          <h1>{room.name}</h1>
          <p className="lead">{announcement(room)}</p>
        </div>
        <span className={`game-room-status game-room-status-${room.status.toLowerCase()}`}>
          {session
            ? `Rodada ${session.currentRoundNumber}/${session.totalRounds}`
            : "Sala de espera"}
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement(room)}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="stop-layout">
        <div className="stop-main">
          {lastSession?.status === "FINISHED" && !session && (
            <section className="card stop-final-result" role="status">
              <span className="stop-trophy" aria-hidden="true">
                🏆
              </span>
              <div>
                <div className="eyebrow">Partida encerrada</div>
                <h2>
                  {finalWinners.map((player) => player.name).join(" e ")}{" "}
                  {finalWinners.length > 1 ? "venceram" : "venceu"}!
                </h2>
                <p className="muted">Todos voltaram à sala de espera para a próxima partida.</p>
              </div>
            </section>
          )}

          {round?.status === "ANSWERING" && session && (
            <section className={`card stop-answer-stage${round.bonusActive ? " is-bonus" : ""}`}>
              <div className="stop-round-banner">
                <div>
                  <span className="eyebrow">
                    {round.bonusActive ? "Tempo extra" : `Rodada ${round.roundNumber}`}
                  </span>
                  <strong className="stop-letter" aria-label={`Letra ${round.letter}`}>
                    {round.letter}
                  </strong>
                </div>
                <div
                  className="stop-timer"
                  role="timer"
                  aria-label={`${remaining} segundos restantes`}
                >
                  <span>{round.bonusActive ? "+10" : "Tempo"}</span>
                  <strong>{remaining}s</strong>
                  <div aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (remaining / (round.bonusActive ? 10 : session.answerSeconds)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="stop-answer-grid">
                {session.categories.map((category, index) => (
                  <label key={category.id}>
                    <span>
                      <b>{index + 1}</b>
                      {category.name}
                    </span>
                    <input
                      autoComplete="off"
                      maxLength={80}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      placeholder={`${category.name} com ${round.letter}`}
                      value={answers[category.id] ?? ""}
                    />
                  </label>
                ))}
              </div>

              <div className="stop-submit-bar">
                <span className={saved ? "is-saved" : ""} aria-live="polite">
                  {saving ? "Salvando…" : saved ? "✓ Respostas salvas" : "Alterações pendentes"}
                </span>
                <button
                  className="button stop-button"
                  disabled={pending || saving}
                  onClick={() => void pressStop()}
                  type="button"
                >
                  STOP!
                </button>
              </div>
            </section>
          )}

          {round?.status === "REVIEWING" && session && currentCategory && (
            <section className="card stop-review-stage">
              <div className="stop-review-header">
                <div>
                  <div className="eyebrow">
                    Revisão {round.reviewCategoryIndex + 1}/{session.categories.length}
                  </div>
                  <h2>{currentCategory.name}</h2>
                  <p className="muted">
                    Letra <strong>{round.letter}</strong> · {session.invalidVoteThreshold} marcação
                    {session.invalidVoteThreshold === 1 ? "" : "ões"} invalidam a resposta.
                  </p>
                </div>
                {round.stoppedByName && (
                  <span className="stop-called-by">STOP por {round.stoppedByName}</span>
                )}
                <div
                  className="stop-review-countdown"
                  role="timer"
                  aria-label={`${reviewRemaining} segundos para a próxima categoria`}
                >
                  <span>Próxima em</span>
                  <strong>{reviewRemaining}s</strong>
                </div>
              </div>

              <div className="stop-review-list">
                {session.players.map((player) => {
                  const answer = round.answers.find(
                    (item) =>
                      item.categoryId === currentCategory.id && item.userId === player.userId,
                  );
                  const systemInvalid = answer ? answer.startsWithLetter === false : true;
                  const invalid =
                    systemInvalid || (answer?.invalidVotes ?? 0) >= session.invalidVoteThreshold;
                  return (
                    <article className={invalid ? "is-invalid" : ""} key={player.userId}>
                      <span className="stop-review-player">{player.name}</span>
                      <strong>{answer?.value || "Sem resposta"}</strong>
                      <span className="stop-review-status">
                        {systemInvalid
                          ? "Não começa com a letra"
                          : `${answer?.invalidVotes ?? 0}/${session.invalidVoteThreshold} inválida`}
                      </span>
                      {answer && player.userId !== room.viewer.userId && !systemInvalid && (
                        <button
                          className={`button small ${answer.viewerMarkedInvalid ? "danger" : "ghost"}`}
                          disabled={pending}
                          onClick={() =>
                            void stopAction({
                              action: "TOGGLE_INVALID",
                              roundId: round.id,
                              answerId: answer.id,
                            })
                          }
                          type="button"
                        >
                          {answer.viewerMarkedInvalid ? "Desmarcar inválida" : "Marcar inválida"}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>

              <p className="muted stop-review-wait" role="status">
                {round.reviewSeconds === 10
                  ? "Sem respostas nesta categoria: avanço automático em 10 segundos."
                  : "A revisão avança automaticamente após 20 segundos."}
              </p>
            </section>
          )}

          {!session && room.status === "WAITING" && (
            <section className="card stop-waiting-stage">
              <div className="stop-alphabet-art" aria-hidden="true">
                <span>S</span>
                <span>T</span>
                <span>O</span>
                <span>P</span>
              </div>
              <div>
                <div className="eyebrow">Sala de espera</div>
                <h2>Prepare as ideias e seja rápido</h2>
                <p className="muted">
                  Todos respondem às mesmas categorias. Quem terminar primeiro salva e aperta STOP.
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="game-room-sidebar stop-sidebar">
          <section className="card">
            <div className="section-title-row">
              <h2>{room.status === "PLAYING" ? "Placar" : "Jogadores"}</h2>
              <span className="muted small">
                {room.players.length}/{room.capacity}
              </span>
            </div>
            {room.status === "PLAYING" ? (
              <div className="stop-scoreboard">
                {[...displayedPlayers]
                  .sort((left, right) => right.score - left.score || left.seat - right.seat)
                  .map((player, index) => (
                    <div className={player.winner ? "is-winner" : ""} key={player.userId}>
                      <span>{index + 1}º</span>
                      <strong>{player.name}</strong>
                      <b>{player.score} pt</b>
                    </div>
                  ))}
              </div>
            ) : (
              <RoomLobbyPlayers capacity={room.capacity} room={room} />
            )}
            <div className="game-room-actions">
              {room.viewer.canJoin && <p role="status">Entrando automaticamente na vaga…</p>}
              {room.viewer.isPlayer && room.status === "WAITING" && (
                <button
                  className={`button${room.viewer.ready ? " secondary" : ""}`}
                  disabled={pending}
                  onClick={() =>
                    void commonAction({ action: "SET_READY", ready: !room.viewer.ready })
                  }
                  type="button"
                >
                  {room.viewer.ready ? "Cancelar pronto" : "Estou pronto"}
                </button>
              )}
              {room.viewer.isPlayer && (
                <button
                  className="button ghost"
                  disabled={pending}
                  onClick={() => void leaveRoom()}
                  type="button"
                >
                  {room.status === "PLAYING" ? "Cancelar partida e sair" : "Sair da sala"}
                </button>
              )}
            </div>
          </section>

          <section className="card game-rules-card stop-rules-card">
            <div className="eyebrow">Regras da sala</div>
            <h2>Configuração</h2>
            <ul>
              <li>{persistedRules.roundCount} rodadas.</li>
              <li>{persistedRules.answerSeconds}s + 10s extras se ninguém apertar STOP.</li>
              <li>{persistedRules.categories.length} categorias, 1 ponto por resposta válida.</li>
              <li>Maioria dos outros jogadores invalida uma resposta.</li>
            </ul>

            {room.viewer.canManage && room.status === "WAITING" && (
              <div className="stop-rule-editor">
                <div className="stop-rule-editor-grid">
                  <label>
                    Máximo de jogadores
                    <select
                      disabled={pending || room.players.some((player) => player.ready)}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          maxPlayers: Number(event.target.value),
                        }))
                      }
                      value={rules.maxPlayers}
                    >
                      {Array.from({ length: 9 }, (_, index) => index + 2).map((value) => (
                        <option disabled={value < room.players.length} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Rodadas
                    <select
                      disabled={pending || room.players.some((player) => player.ready)}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          roundCount: Number(event.target.value),
                        }))
                      }
                      value={rules.roundCount}
                    >
                      {Array.from({ length: 7 }, (_, index) => index + 4).map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tempo
                    <select
                      disabled={pending || room.players.some((player) => player.ready)}
                      onChange={(event) =>
                        setRules((current) => ({
                          ...current,
                          answerSeconds: Number(event.target.value) as StopRules["answerSeconds"],
                        }))
                      }
                      value={rules.answerSeconds}
                    >
                      {[15, 20, 25, 30].map((value) => (
                        <option key={value} value={value}>
                          {value}s
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <fieldset>
                  <legend>Letras do sorteio</legend>
                  <div className="stop-letter-picker">
                    {STOP_ALPHABET.map((letter) => (
                      <label key={letter}>
                        <input
                          checked={rules.letters.includes(letter)}
                          disabled={pending || room.players.some((player) => player.ready)}
                          onChange={() => toggleLetter(letter)}
                          type="checkbox"
                        />
                        <span>{letter}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Categorias ({rules.categories.length}/20)</legend>
                  <div className="stop-category-editor">
                    {rules.categories.map((category, index) => (
                      <div key={`${category}-${index}`}>
                        <input
                          disabled={pending || room.players.some((player) => player.ready)}
                          maxLength={60}
                          onChange={(event) =>
                            setRules((current) => ({
                              ...current,
                              categories: current.categories.map((item, itemIndex) =>
                                itemIndex === index ? event.target.value : item,
                              ),
                            }))
                          }
                          value={category}
                        />
                        <button
                          aria-label={`Remover ${category}`}
                          disabled={
                            rules.categories.length <= 8 ||
                            pending ||
                            room.players.some((player) => player.ready)
                          }
                          onClick={() =>
                            setRules((current) => ({
                              ...current,
                              categories: current.categories.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                          type="button"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div>
                      <input
                        disabled={rules.categories.length >= 20}
                        maxLength={60}
                        onChange={(event) => setNewCategory(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addCategory();
                          }
                        }}
                        placeholder="Nova categoria"
                        value={newCategory}
                      />
                      <button onClick={addCategory} type="button">
                        +
                      </button>
                    </div>
                  </div>
                </fieldset>

                <button
                  className="button secondary"
                  disabled={
                    pending ||
                    room.players.some((player) => player.ready) ||
                    rules.letters.length < 1 ||
                    rules.categories.length < 8
                  }
                  onClick={() =>
                    void commonAction({ action: "UPDATE_RULES", rules: { ...rules, version: 1 } })
                  }
                  type="button"
                >
                  Salvar regras
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
