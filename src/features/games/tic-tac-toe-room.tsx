"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameRoomAction, TicTacToeRules } from "@/lib/validation/games";
import type { GameRoomDetail } from "@/server/services/game-service";

const outcomeLabel = {
  X_WON: "Vitória de X",
  O_WON: "Vitória de O",
  DRAW: "Empate",
  X_WON_FORFEIT: "Vitória de X por desistência",
  O_WON_FORFEIT: "Vitória de O por desistência",
} as const;

function roomAnnouncement(room: GameRoomDetail) {
  if (room.currentMatch) {
    const player = room.players.find(
      (candidate) => candidate.userId === room.currentMatch?.nextTurnUserId,
    );
    return `Rodada ${room.currentMatch.roundNumber}. Vez de ${player?.name ?? "outro jogador"}.`;
  }
  if (room.lastMatch?.outcome === "DRAW") return "A última partida terminou empatada.";
  if (room.lastMatch?.winnerName) return `${room.lastMatch.winnerName} venceu a última partida.`;
  return room.players.length < 2 ? "Aguardando o segundo jogador." : "Marquem pronto para iniciar.";
}

export function TicTacToeRoom({
  communityId,
  communitySlug,
  initialRoom,
}: {
  communityId: string;
  communitySlug: string;
  initialRoom: GameRoomDetail;
}) {
  const [room, setRoom] = useState(initialRoom);
  const [starterMode, setStarterMode] = useState((initialRoom.rules as TicTacToeRules).starterMode);
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
      // A próxima atualização tenta novamente; ações manuais continuam exibindo erros.
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
    async (path: "actions" | "moves", body: unknown) => {
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
        setStarterMode((payload.room.rules as TicTacToeRules).starterMode);
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

  const match = room.currentMatch;
  const viewerTurn = Boolean(match && match.nextTurnUserId === room.viewer.userId);
  const lastResult = match ? null : room.lastMatch;
  const displayedMatch = match ?? lastResult;
  const rules = room.rules as TicTacToeRules;

  return (
    <>
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
      </Link>
      <div className="page-heading game-room-heading">
        <div>
          <div className="eyebrow">Jogo da velha · Sala</div>
          <h1>{room.name}</h1>
          <p className="lead">{roomAnnouncement(room)}</p>
        </div>
        <span className={`game-room-status game-room-status-${room.status.toLowerCase()}`}>
          {room.status === "PLAYING"
            ? `Rodada ${room.roundNumber}`
            : room.status === "CLOSED"
              ? "Fechada"
              : "Sala de espera"}
        </span>
      </div>

      <p className="sr-only" aria-live="polite">
        {roomAnnouncement(room)}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="tic-tac-toe-layout">
        <section className="card tic-tac-toe-stage" aria-label="Partida de jogo da velha">
          {lastResult && (
            <div className="game-result" role="status">
              <span aria-hidden="true">{lastResult.outcome === "DRAW" ? "🤝" : "🏆"}</span>
              <div>
                <strong>
                  {lastResult.winnerName
                    ? `${lastResult.winnerName} venceu!`
                    : "Deu velha: empate!"}
                </strong>
                <small>
                  {lastResult.outcome ? outcomeLabel[lastResult.outcome] : "Partida encerrada"}
                </small>
              </div>
            </div>
          )}

          <div className="tic-tac-toe-board" role="group" aria-label="Tabuleiro 3 por 3">
            {Array.from({ length: 9 }, (_, cell) => {
              const mark = displayedMatch?.board[cell] ?? "-";
              const winning =
                displayedMatch?.winningLine?.some((winningCell) => winningCell === cell) ?? false;
              const canPlay = viewerTurn && mark === "-" && !pending;
              const row = Math.floor(cell / 3) + 1;
              const column = (cell % 3) + 1;
              return (
                <button
                  aria-label={
                    mark === "-"
                      ? `Linha ${row}, coluna ${column}, vazia`
                      : `Linha ${row}, coluna ${column}, ${mark}`
                  }
                  className={`tic-tac-toe-cell${winning ? " is-winning" : ""}`}
                  disabled={!canPlay}
                  key={cell}
                  onClick={() => match && void request("moves", { matchId: match.id, cell })}
                  type="button"
                >
                  {mark === "-" ? "" : mark}
                </button>
              );
            })}
          </div>

          <div className="game-turn-message">
            {match ? (
              viewerTurn ? (
                <strong>Sua vez — você joga com {room.viewer.mark}</strong>
              ) : (
                <span>
                  Vez de{" "}
                  {room.players.find((player) => player.userId === match.nextTurnUserId)?.name}
                </span>
              )
            ) : room.status === "CLOSED" ? (
              <span>Esta sala foi fechada.</span>
            ) : (
              <span>A próxima rodada começa quando os dois jogadores estiverem prontos.</span>
            )}
          </div>
        </section>

        <aside className="game-room-sidebar">
          <section className="card">
            <div className="section-title-row">
              <h2>Jogadores</h2>
              <span className="muted small">{room.players.length}/2</span>
            </div>
            <div className="game-player-list">
              {[1, 2].map((seat) => {
                const player = room.players.find((candidate) => candidate.seat === seat);
                return (
                  <div className={`game-player${player?.ready ? " is-ready" : ""}`} key={seat}>
                    <span className="game-player-mark">{player?.mark ?? seat}</span>
                    <div>
                      <strong>{player?.name ?? "Vaga disponível"}</strong>
                      <small>
                        {player
                          ? room.status === "PLAYING"
                            ? `Jogando com ${player.mark}`
                            : player.ready
                              ? "Pronto"
                              : "Aguardando"
                          : "Entre para jogar"}
                      </small>
                    </div>
                  </div>
                );
              })}
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
                  {room.status === "PLAYING" ? "Desistir e sair" : "Sair da sala"}
                </button>
              )}
            </div>
          </section>

          <section className="card game-rules-card">
            <div className="eyebrow">Regras da sala</div>
            <h2>Como funciona</h2>
            <ul>
              <li>Faça três marcas em linha, coluna ou diagonal.</li>
              <li>O jogador X sempre faz a primeira jogada.</li>
              <li>
                Primeiro jogador: {rules.starterMode === "ALTERNATE" ? "alternado" : "sorteado"}.
              </li>
              <li>Sair durante a rodada conta como desistência.</li>
            </ul>
            {room.viewer.canManage && room.status === "WAITING" && (
              <div className="game-rule-controls">
                <label>
                  Definição do primeiro jogador
                  <select
                    disabled={pending || room.players.some((player) => player.ready)}
                    onChange={(event) =>
                      setStarterMode(event.target.value as "ALTERNATE" | "RANDOM")
                    }
                    value={starterMode}
                  >
                    <option value="ALTERNATE">Alternar por rodada</option>
                    <option value="RANDOM">Sortear por rodada</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={
                    pending ||
                    room.players.some((player) => player.ready) ||
                    starterMode === rules.starterMode
                  }
                  onClick={() =>
                    void action({
                      action: "UPDATE_RULES",
                      rules: { version: 1, starterMode },
                    })
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
        </aside>
      </div>
    </>
  );
}
