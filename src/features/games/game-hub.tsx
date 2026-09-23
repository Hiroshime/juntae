"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DEFAULT_STOP_CATEGORIES, DEFAULT_STOP_LETTERS } from "@/lib/games/stop-game";
import type { GameHub as GameHubData } from "@/server/services/game-service";

function formatPeriod(startDate: string, endDate: string) {
  const format = (value: string) => value.split("-").reverse().join("/");
  return `${format(startDate)} a ${format(endDate)}`;
}

function Leaderboard({
  title,
  period,
}: {
  title: string;
  period: GameHubData["leaderboards"]["week"];
}) {
  return (
    <section className="card game-ranking-card">
      <div className="card-header">
        <div>
          <div className="eyebrow">Ranking</div>
          <h2>{title}</h2>
        </div>
        <span className="muted small">{formatPeriod(period.startDate, period.endDate)}</span>
      </div>
      {period.entries.length ? (
        <ol className="game-ranking-list">
          {period.entries.map((entry) => (
            <li key={entry.userId}>
              <span className="game-ranking-position">{entry.rank}º</span>
              <span className="game-ranking-name">{entry.name}</span>
              <strong>{entry.wins} vitórias</strong>
              <span className="muted small">
                {entry.games} jogos · {entry.draws} empates
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">O ranking aparece assim que a primeira partida terminar.</p>
      )}
    </section>
  );
}

export function GameHub({
  communityId,
  communitySlug,
  initialHub,
}: {
  communityId: string;
  communitySlug: string;
  initialHub: GameHubData;
}) {
  const router = useRouter();
  const [name, setName] = useState("Jogo da velha");
  const [hangmanName, setHangmanName] = useState("Forca da turma");
  const [wordCount, setWordCount] = useState(5);
  const [stopName, setStopName] = useState("Stop da turma");
  const [starterMode, setStarterMode] = useState<"ALTERNATE" | "RANDOM">("ALTERNATE");
  const [creating, setCreating] = useState<"TIC_TAC_TOE" | "HANGMAN" | "STOP" | null>(null);
  const [error, setError] = useState("");
  const [errorGame, setErrorGame] = useState<"TIC_TAC_TOE" | "HANGMAN" | "STOP" | null>(null);
  const [rooms, setRooms] = useState(initialHub.rooms);
  const [roomsRefreshFailed, setRoomsRefreshFailed] = useState(false);
  const roomsRefreshPending = useRef(false);

  const refreshRooms = useCallback(
    async (signal?: AbortSignal) => {
      if (roomsRefreshPending.current) return;
      roomsRefreshPending.current = true;
      try {
        const response = await fetch(`/api/communities/${communityId}/games/rooms`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new Error("Não foi possível atualizar as salas.");
        const payload = (await response.json()) as Pick<GameHubData, "rooms">;
        if (!signal?.aborted) {
          setRooms(payload.rooms);
          setRoomsRefreshFailed(false);
        }
      } catch {
        if (!signal?.aborted) setRoomsRefreshFailed(true);
      } finally {
        roomsRefreshPending.current = false;
      }
    },
    [communityId],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      if (document.visibilityState === "visible") await refreshRooms(controller.signal);
      if (!cancelled) timer = window.setTimeout(poll, 4_000);
    };
    timer = window.setTimeout(poll, 4_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshRooms(controller.signal);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshRooms]);

  async function createRoom(event: FormEvent, gameType: "TIC_TAC_TOE" | "HANGMAN" | "STOP") {
    event.preventDefault();
    setCreating(gameType);
    setError("");
    setErrorGame(null);
    try {
      const response = await fetch(`/api/communities/${communityId}/games/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          gameType === "HANGMAN"
            ? { gameType, name: hangmanName, rules: { version: 1, wordCount } }
            : gameType === "STOP"
              ? {
                  gameType,
                  name: stopName,
                  rules: {
                    version: 1,
                    maxPlayers: 10,
                    roundCount: 6,
                    answerSeconds: 20,
                    letters: DEFAULT_STOP_LETTERS,
                    categories: DEFAULT_STOP_CATEGORIES,
                  },
                }
              : { gameType, name, rules: { version: 1, starterMode } },
        ),
      });
      const payload = (await response.json()) as { room?: { id: string }; error?: string };
      if (!response.ok || !payload.room)
        throw new Error(payload.error || "Não foi possível criar.");
      router.push(`/app/${communitySlug}/games/${payload.room.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar a sala.");
      setErrorGame(gameType);
      setCreating(null);
    }
  }

  return (
    <>
      <div className="page-heading games-heading">
        <div>
          <div className="eyebrow">Jogos da comunidade</div>
          <h1>Uma pausa para jogar junto</h1>
          <p className="lead">
            Abra uma sala, chame alguém da turma e dispute partidas rápidas com placares semanais e
            mensais.
          </p>
        </div>
        <span className="games-heading-icon" aria-hidden="true">
          🎮
        </span>
      </div>

      <div className="games-catalog-grid">
        <section className="card game-catalog-card arcade-catalog-card">
          <div className="game-cover bell-hop-cover" aria-hidden="true">
            <span className="bell-hop-cover-bunny">●</span>
            <span className="bell-hop-cover-bell">♢</span>
            <span className="bell-hop-cover-bell second">♢</span>
          </div>
          <div>
            <div className="eyebrow">Arcade solo · mouse ou toque</div>
            <h2>Salto dos Sinos</h2>
            <p className="muted">
              Guie o coelho pelos sinos, suba o máximo que conseguir e dispute o recorde da turma.
            </p>
          </div>
          <Link className="button" href={`/app/${communitySlug}/games/bell-hop`}>
            Jogar agora
          </Link>
        </section>

        <section className="card game-catalog-card arcade-catalog-card tower-catalog-card">
          <div className="game-cover tower-stack-cover" aria-hidden="true">
            <span className="tower-cover-rope" />
            <span className="tower-cover-block swinging" />
            <span className="tower-cover-block floor-one" />
            <span className="tower-cover-block floor-two" />
            <span className="tower-cover-block floor-three" />
          </div>
          <div>
            <div className="eyebrow">Arcade solo · precisão e equilíbrio</div>
            <h2>Torre em Equilíbrio</h2>
            <p className="muted">
              Solte os blocos do pêndulo, administre três vidas e construa a torre mais alta da
              comunidade.
            </p>
          </div>
          <Link className="button" href={`/app/${communitySlug}/games/tower-stack`}>
            Jogar agora
          </Link>
        </section>

        <section className="card game-catalog-card">
          <div className="game-cover" aria-hidden="true">
            <span>×</span>
            <span>○</span>
            <span>×</span>
          </div>
          <div>
            <div className="eyebrow">2 jogadores</div>
            <h2>Jogo da velha</h2>
            <p className="muted">
              Três marcas em linha vencem. Os jogadores confirmam que estão prontos antes de cada
              rodada.
            </p>
          </div>
          <form
            className="game-create-form"
            onSubmit={(event) => void createRoom(event, "TIC_TAC_TOE")}
          >
            <label>
              Nome da sala
              <input
                maxLength={80}
                minLength={2}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label>
              Quem começa
              <select
                onChange={(event) => setStarterMode(event.target.value as "ALTERNATE" | "RANDOM")}
                value={starterMode}
              >
                <option value="ALTERNATE">Alternar a cada rodada</option>
                <option value="RANDOM">Sortear a cada rodada</option>
              </select>
            </label>
            <button className="button" disabled={creating !== null} type="submit">
              {creating === "TIC_TAC_TOE" ? "Criando…" : "Criar sala"}
            </button>
            {error && errorGame === "TIC_TAC_TOE" && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>

        <section className="card game-catalog-card hangman-catalog-card">
          <div className="game-cover hangman-cover" aria-hidden="true">
            <span>┌</span>
            <span>☹</span>
            <span>╱│╲</span>
          </div>
          <div>
            <div className="eyebrow">2 a 5 jogadores</div>
            <h2>Jogo da forca</h2>
            <p className="muted">
              Descubra a palavra antes de completar o boneco. Cada acerto vale um ponto na partida.
            </p>
          </div>
          <form
            className="game-create-form"
            onSubmit={(event) => void createRoom(event, "HANGMAN")}
          >
            <label>
              Nome da sala
              <input
                maxLength={80}
                minLength={2}
                onChange={(event) => setHangmanName(event.target.value)}
                required
                value={hangmanName}
              />
            </label>
            <label>
              Palavras na partida
              <input
                max={20}
                min={1}
                onChange={(event) => setWordCount(Number(event.target.value))}
                required
                type="number"
                value={wordCount}
              />
            </label>
            <button className="button" disabled={creating !== null} type="submit">
              {creating === "HANGMAN" ? "Criando…" : "Criar sala"}
            </button>
            {error && errorGame === "HANGMAN" && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>

        <section className="card game-catalog-card stop-catalog-card">
          <div className="game-cover stop-cover" aria-hidden="true">
            <span>S</span>
            <span>T</span>
            <span>O</span>
            <span>P</span>
          </div>
          <div>
            <div className="eyebrow">2 a 10 jogadores · palavras e velocidade</div>
            <h2>Stop da Turma</h2>
            <p className="muted">
              Responda às categorias com a letra sorteada, aperte STOP e revise com todo mundo.
            </p>
          </div>
          <form
            className="game-create-form stop-create-form"
            onSubmit={(event) => void createRoom(event, "STOP")}
          >
            <label>
              Nome da sala
              <input
                maxLength={80}
                minLength={2}
                onChange={(event) => setStopName(event.target.value)}
                required
                value={stopName}
              />
            </label>
            <p className="muted small stop-create-hint">
              Depois de criar, configure jogadores, rodadas, tempo, letras e categorias dentro da
              sala.
            </p>
            <button className="button" disabled={creating !== null} type="submit">
              {creating === "STOP" ? "Criando…" : "Criar sala"}
            </button>
            {error && errorGame === "STOP" && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
      </div>

      <section className="games-room-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Ao vivo</div>
            <h2>Salas abertas</h2>
          </div>
          <div className="game-room-refresh-summary">
            <span className="muted small" role={roomsRefreshFailed ? "status" : undefined}>
              {roomsRefreshFailed ? "Tentando reconectar…" : "Atualização automática"}
            </span>
            <span className="pill">{rooms.length} salas</span>
          </div>
        </div>
        {rooms.length ? (
          <div className="game-room-grid">
            {rooms.map((room) => (
              <Link
                className="card game-room-card"
                href={`/app/${communitySlug}/games/${room.id}`}
                key={room.id}
              >
                <div className="card-header">
                  <span
                    className={`game-room-status game-room-status-${room.status.toLowerCase()}`}
                  >
                    {room.status === "PLAYING" ? "Em partida" : "Aguardando"}
                  </span>
                  <span className="muted small">
                    {room.players.length}/{room.capacity}
                  </span>
                </div>
                <div className="eyebrow">
                  {room.gameType === "HANGMAN"
                    ? "Forca"
                    : room.gameType === "STOP"
                      ? "Stop da Turma"
                      : "Jogo da velha"}
                </div>
                <h3>{room.name}</h3>
                <p className="muted">
                  {room.players.length
                    ? room.players.map((player) => player.name).join(" × ")
                    : "Sala vazia"}
                </p>
                <strong>
                  {room.players.length < room.capacity ? "Há uma vaga →" : "Abrir sala →"}
                </strong>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card empty-state compact-empty-state">
            <span className="empty-icon" aria-hidden="true">
              ⊞
            </span>
            <h3>Nenhuma sala aberta</h3>
            <p className="muted">Crie a primeira sala e convide alguém para uma rodada.</p>
          </div>
        )}
      </section>

      <section className="games-ranking-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Jogo da velha</div>
            <h2>Melhores da comunidade</h2>
          </div>
        </div>
        <div className="game-leaderboards">
          <Leaderboard period={initialHub.leaderboards.week} title="Mais vitórias na semana" />
          <Leaderboard period={initialHub.leaderboards.month} title="Mais vitórias no mês" />
        </div>
      </section>

      <section className="games-ranking-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Jogo da forca</div>
            <h2>Mestres das palavras</h2>
          </div>
        </div>
        <div className="game-leaderboards">
          <Leaderboard
            period={initialHub.hangmanLeaderboards.week}
            title="Mais vitórias na semana"
          />
          <Leaderboard period={initialHub.hangmanLeaderboards.month} title="Mais vitórias no mês" />
        </div>
      </section>

      <section className="games-ranking-section">
        <div className="section-title-row">
          <div>
            <div className="eyebrow">Stop da Turma</div>
            <h2>Mentes mais rápidas</h2>
          </div>
        </div>
        <div className="game-leaderboards">
          <Leaderboard period={initialHub.stopLeaderboards.week} title="Mais vitórias na semana" />
          <Leaderboard period={initialHub.stopLeaderboards.month} title="Mais vitórias no mês" />
        </div>
      </section>
    </>
  );
}
