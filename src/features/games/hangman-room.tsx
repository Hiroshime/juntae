"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { HANGMAN_PARTS } from "@/lib/games/hangman";
import type { GameRoomAction, HangmanRules } from "@/lib/validation/games";
import type { GameRoomDetail } from "@/server/services/game-service";

function HangmanDrawing({ wrongCount }: { wrongCount: number }) {
  const visible = (part: number) => (wrongCount >= part ? " is-visible" : "");
  return (
    <div className="hangman-drawing">
      <svg viewBox="0 0 260 270" role="img" aria-label={`${wrongCount} de 10 erros`}>
        <path className="hangman-gallows" d="M25 245h210M62 245V25h112v30M58 25h28M174 25v30" />
        <circle className={`hangman-part${visible(1)}`} cx="174" cy="82" r="27" />
        <path className={`hangman-part${visible(2)}`} d="M174 109v70" />
        <path className={`hangman-part${visible(3)}`} d="M174 126l40 34" />
        <path className={`hangman-part${visible(4)}`} d="M174 126l-40 34" />
        <path className={`hangman-part${visible(5)}`} d="M174 179l36 48" />
        <path className={`hangman-part${visible(6)}`} d="M174 179l-36 48" />
        <g className={`hangman-part${visible(7)}`}>
          <circle cx="164" cy="78" r="2.5" />
          <circle cx="184" cy="78" r="2.5" />
        </g>
        <path className={`hangman-part${visible(8)}`} d="M162 94q12-10 24 0" />
        <path className={`hangman-part${visible(9)}`} d="M174 82l-4 8h8" />
        <path className={`hangman-part${visible(10)}`} d="M151 69q6-25 15-7q8-23 14 0q11-20 17 8" />
      </svg>
      <div className="hangman-error-meter" aria-hidden="true">
        {HANGMAN_PARTS.map((part, index) => (
          <span className={index < wrongCount ? "is-wrong" : ""} key={part} />
        ))}
      </div>
      <strong>{wrongCount}/10 erros</strong>
    </div>
  );
}

function announcement(room: GameRoomDetail) {
  const session = room.hangman.currentSession;
  const round = session?.currentRound;
  if (round?.status === "SETTING_WORD") return `${round.setterName} está preparando a palavra.`;
  if (round?.status === "GUESSING") {
    const current = session?.players.find((player) => player.userId === round.currentTurnUserId);
    return `Rodada ${round.roundNumber}. Vez de ${current?.name ?? "outro jogador"}.`;
  }
  const last = room.hangman.lastSession;
  if (last?.status === "FINISHED") {
    const winners = last.players.filter((player) => player.winner).map((player) => player.name);
    return winners.length > 1
      ? `Partida encerrada com empate entre ${winners.join(" e ")}.`
      : `${winners[0] ?? "A turma"} venceu a partida.`;
  }
  return room.players.length < 2
    ? "Aguardando ao menos mais um jogador."
    : "Marquem pronto para começar.";
}

export function HangmanRoom({
  communityId,
  communitySlug,
  initialRoom,
}: {
  communityId: string;
  communitySlug: string;
  initialRoom: GameRoomDetail;
}) {
  const [room, setRoom] = useState(initialRoom);
  const [wordCount, setWordCount] = useState((initialRoom.rules as HangmanRules).wordCount);
  const [word, setWord] = useState("");
  const [clue, setClue] = useState("");
  const [guessType, setGuessType] = useState<"LETTER" | "WORD">("LETTER");
  const [guess, setGuess] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const autoJoinAttempted = useRef(false);
  const baseUrl = `/api/communities/${communityId}/games/rooms/${room.id}`;

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
    const delay = room.status === "PLAYING" ? 600 : 900;
    const poll = async () => {
      if (document.visibilityState === "visible" && !pending) await refresh();
      if (!cancelled) timer = window.setTimeout(poll, delay);
    };
    timer = window.setTimeout(poll, delay);
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

  const request = useCallback(
    async (path: "actions" | "hangman/word" | "hangman/guesses", body: unknown) => {
      setPending(true);
      setError("");
      try {
        const response = await fetch(`${baseUrl}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { room?: GameRoomDetail; error?: string };
        if (!response.ok || !payload.room) throw new Error(payload.error || "Ação não concluída.");
        setRoom(payload.room);
        setWordCount((payload.room.rules as HangmanRules).wordCount);
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

  const action = useCallback((value: GameRoomAction) => request("actions", value), [request]);

  useEffect(() => {
    if (autoJoinAttempted.current) return;
    autoJoinAttempted.current = true;
    if (room.viewer.canJoin) void action({ action: "JOIN" });
  }, [action, room.viewer.canJoin]);

  async function leaveRoom() {
    if (!(await action({ action: "LEAVE" }))) return;
    window.location.assign(`/app/${communitySlug}/games`);
  }

  async function submitWord(event: FormEvent) {
    event.preventDefault();
    const round = room.hangman.currentSession?.currentRound;
    if (!round) return;
    if (await request("hangman/word", { roundId: round.id, word, clue })) {
      setWord("");
      setClue("");
    }
  }

  async function submitGuess(event: FormEvent) {
    event.preventDefault();
    const round = room.hangman.currentSession?.currentRound;
    if (!round) return;
    if (await request("hangman/guesses", { roundId: round.id, type: guessType, value: guess })) {
      setGuess("");
    }
  }

  const session = room.hangman.currentSession;
  const lastSession = room.hangman.lastSession;
  const round = session?.currentRound;
  const viewerIsSetter = round?.setterId === room.viewer.userId;
  const viewerTurn = round?.currentTurnUserId === room.viewer.userId;
  const shownSession = session ?? lastSession;
  const shownRound = session?.currentRound ?? lastSession?.currentRound;
  const rules = room.rules as HangmanRules;
  const finalWinners = lastSession?.players.filter((player) => player.winner) ?? [];

  return (
    <>
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
      </Link>
      <div className="page-heading game-room-heading">
        <div>
          <div className="eyebrow">Jogo da forca · Sala</div>
          <h1>{room.name}</h1>
          <p className="lead">{announcement(room)}</p>
        </div>
        <span className={`game-room-status game-room-status-${room.status.toLowerCase()}`}>
          {session
            ? `Palavra ${session.currentRoundNumber}/${session.totalRounds}`
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

      <div className="hangman-layout">
        <section className="card hangman-stage" aria-label="Partida de jogo da forca">
          {lastSession?.status === "FINISHED" && !session && (
            <div className="game-result" role="status">
              <span aria-hidden="true">🏆</span>
              <div>
                <strong>
                  {finalWinners.map((player) => player.name).join(" e ")}{" "}
                  {finalWinners.length > 1 ? "venceram" : "venceu"}!
                </strong>
                <small>Placar final de {lastSession.totalRounds} palavras</small>
              </div>
            </div>
          )}

          {session?.previousRound && round?.status === "SETTING_WORD" && (
            <div className="hangman-round-result" role="status">
              <strong>
                {session.previousRound.outcome === "GUESSED"
                  ? `${session.previousRound.winnerName} acertou a palavra anterior!`
                  : "Ninguém descobriu a palavra anterior."}
              </strong>
              {session.previousRound.secretWord && (
                <span>A palavra era “{session.previousRound.secretWord}”.</span>
              )}
            </div>
          )}

          <HangmanDrawing wrongCount={shownRound?.wrongCount ?? 0} />

          {shownRound?.maskedWord ? (
            <div className="hangman-word-area">
              <div className="hangman-word" aria-label={`Palavra: ${shownRound.maskedWord}`}>
                {shownRound.maskedWord}
              </div>
              {shownRound.clue && (
                <p>
                  <strong>Dica:</strong> {shownRound.clue}
                </p>
              )}
              {!!shownRound.guessedLetters.length && (
                <p className="muted small">Letras usadas: {shownRound.guessedLetters.join(", ")}</p>
              )}
            </div>
          ) : (
            <div className="hangman-word-placeholder">
              <strong>A palavra ainda é segredo</strong>
              <span>
                {round ? `${round.setterName} está escolhendo.` : "Aguardando a próxima partida."}
              </span>
            </div>
          )}

          {round?.status === "SETTING_WORD" && viewerIsSetter && (
            <form className="hangman-play-form" onSubmit={submitWord}>
              <div className="eyebrow">Você é o mestre desta rodada</div>
              <label>
                Palavra ou expressão secreta
                <input
                  autoComplete="off"
                  maxLength={80}
                  minLength={2}
                  onChange={(event) => setWord(event.target.value)}
                  required
                  value={word}
                />
              </label>
              <label>
                Dica opcional
                <input
                  maxLength={160}
                  onChange={(event) => setClue(event.target.value)}
                  value={clue}
                />
              </label>
              <button className="button" disabled={pending} type="submit">
                Começar rodada
              </button>
              <small className="muted">
                A palavra será mantida em segredo dos outros jogadores.
              </small>
            </form>
          )}

          {round?.status === "SETTING_WORD" && !viewerIsSetter && (
            <div className="hangman-wait-message" role="status">
              <span aria-hidden="true">🤫</span>
              <strong>{round.setterName} está escolhendo a palavra…</strong>
            </div>
          )}

          {round?.status === "GUESSING" && viewerTurn && (
            <form className="hangman-play-form" onSubmit={submitGuess}>
              <div className="eyebrow">Sua vez</div>
              <div className="hangman-guess-tabs" role="group" aria-label="Tipo de palpite">
                <button
                  className={guessType === "LETTER" ? "is-active" : ""}
                  onClick={() => {
                    setGuessType("LETTER");
                    setGuess("");
                  }}
                  type="button"
                >
                  Uma letra
                </button>
                <button
                  className={guessType === "WORD" ? "is-active" : ""}
                  onClick={() => {
                    setGuessType("WORD");
                    setGuess("");
                  }}
                  type="button"
                >
                  Palavra inteira
                </button>
              </div>
              <label>
                {guessType === "LETTER" ? "Digite uma letra" : "Digite seu palpite"}
                <input
                  autoComplete="off"
                  maxLength={guessType === "LETTER" ? 1 : 80}
                  onChange={(event) => setGuess(event.target.value)}
                  pattern={guessType === "LETTER" ? "[A-Za-zÀ-ÖØ-öø-ÿ]" : undefined}
                  required
                  value={guess}
                />
              </label>
              <button className="button" disabled={pending} type="submit">
                Confirmar palpite
              </button>
            </form>
          )}

          {round?.status === "GUESSING" && !viewerTurn && (
            <div className="game-turn-message">
              <span>
                Vez de{" "}
                {session?.players.find((player) => player.userId === round.currentTurnUserId)?.name}
              </span>
            </div>
          )}

          {shownRound?.status === "FINISHED" && (
            <div className="hangman-round-result">
              <strong>
                {shownRound.outcome === "GUESSED"
                  ? `${shownRound.winnerName} acertou!`
                  : shownRound.outcome === "HANGED"
                    ? "O boneco foi completado!"
                    : "A partida foi cancelada."}
              </strong>
              {shownRound.secretWord && <span>A palavra era “{shownRound.secretWord}”.</span>}
            </div>
          )}
        </section>

        <aside className="game-room-sidebar">
          <section className="card">
            <div className="section-title-row">
              <h2>Jogadores</h2>
              <span className="muted small">{room.players.length}/5</span>
            </div>
            <div className="hangman-scoreboard">
              {(
                shownSession?.players ??
                room.players.map((player, index) => ({
                  ...player,
                  turnOrder: index + 1,
                  score: 0,
                  winner: false,
                }))
              ).map((player) => (
                <div
                  className={`${player.userId === round?.currentTurnUserId ? "is-current" : ""}${player.userId === round?.setterId ? " is-setter" : ""}`}
                  key={player.userId}
                >
                  <span className="hangman-player-order">{player.turnOrder}º</span>
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.userId === round?.setterId
                        ? "Mestre da palavra"
                        : player.userId === round?.currentTurnUserId
                          ? "Jogando agora"
                          : "Na rodada"}
                    </small>
                  </span>
                  <strong>
                    {player.score} pt{player.score === 1 ? "" : "s"}
                  </strong>
                </div>
              ))}
            </div>

            <div className="game-room-actions">
              {room.viewer.canJoin && (
                <p className="game-auto-join" role="status">
                  Entrando automaticamente na vaga…
                </p>
              )}
              {room.viewer.isPlayer && room.status === "WAITING" && (
                <button
                  className={`button${room.viewer.ready ? " secondary" : ""}`}
                  disabled={pending}
                  onClick={() => void action({ action: "SET_READY", ready: !room.viewer.ready })}
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

          <section className="card game-rules-card">
            <div className="eyebrow">Regras da sala</div>
            <h2>Como funciona</h2>
            <ul>
              <li>São necessários de 2 a 5 jogadores prontos.</li>
              <li>O mestre e a ordem dos turnos são sorteados.</li>
              <li>Uma letra ou palavra errada adiciona uma parte ao boneco.</li>
              <li>Quem acertar a palavra ganha 1 ponto; a partida pode terminar empatada.</li>
            </ul>
            <p className="muted small">
              Partida com {rules.wordCount} palavra{rules.wordCount === 1 ? "" : "s"}.
            </p>
            {room.viewer.canManage && room.status === "WAITING" && (
              <div className="game-rule-controls">
                <label>
                  Quantidade de palavras
                  <input
                    disabled={pending || room.players.some((player) => player.ready)}
                    max={20}
                    min={1}
                    onChange={(event) => setWordCount(Number(event.target.value))}
                    type="number"
                    value={wordCount}
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={
                    pending ||
                    room.players.some((player) => player.ready) ||
                    wordCount === rules.wordCount
                  }
                  onClick={() =>
                    void action({ action: "UPDATE_RULES", rules: { version: 1, wordCount } })
                  }
                  type="button"
                >
                  Salvar regra
                </button>
              </div>
            )}
            {room.viewer.canManage && room.status !== "PLAYING" && (
              <button
                className="button ghost"
                disabled={pending}
                onClick={() =>
                  void action({ action: room.status === "CLOSED" ? "REOPEN" : "CLOSE" })
                }
                type="button"
              >
                {room.status === "CLOSED" ? "Reabrir sala" : "Fechar sala"}
              </button>
            )}
          </section>

          {!!shownRound?.guesses.length && (
            <section className="card hangman-history">
              <div className="eyebrow">Palpites da rodada</div>
              <ul>
                {shownRound.guesses
                  .slice()
                  .reverse()
                  .map((item) => (
                    <li key={item.id}>
                      <span>{item.correct ? "✓" : "×"}</span>
                      <span>
                        <strong>{item.userName}</strong>
                        <small>
                          {item.type === "LETTER" ? "Letra" : "Palavra"}: {item.value}
                        </small>
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
