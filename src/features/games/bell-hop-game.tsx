"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BELL_HOP_HEIGHT,
  BELL_HOP_WIDTH,
  bellHopMotion,
  bellHopPlatform,
  bellHopScore,
  type BellHopPlatform,
} from "@/lib/games/bell-hop";
import type { BellHopLeaderboards } from "@/server/services/bell-hop-service";

type GameState = "IDLE" | "STARTING" | "PLAYING" | "FINISHING" | "GAME_OVER";
type ActiveRun = { id: string; seed: number; startedAt: string };
type Snowflake = { x: number; y: number; radius: number; speed: number; drift: number };
type Runtime = {
  run: ActiveRun;
  playerX: number;
  playerY: number;
  velocityY: number;
  cameraY: number;
  maxHeight: number;
  bellsHit: number;
  bells: Array<BellHopPlatform & { hit: boolean }>;
  nextLevel: number;
  startedAt: number;
  lastFrame: number;
  lastHudAt: number;
  snow: Snowflake[];
};

function formatPeriod(startDate: string, endDate: string) {
  const format = (value: string) => value.split("-").reverse().join("/");
  return `${format(startDate)} a ${format(endDate)}`;
}

function createSnow(seed: number) {
  return Array.from({ length: 62 }, (_, index) => {
    const value = Math.abs(Math.sin(seed * 0.0001 + index * 91.17));
    return {
      x: (value * 9_973) % BELL_HOP_WIDTH,
      y: (value * 5_927 + index * 37) % BELL_HOP_HEIGHT,
      radius: 1.2 + (index % 4) * 0.55,
      speed: 18 + (index % 7) * 5,
      drift: 5 + (index % 5) * 2,
    };
  });
}

function visibleBellX(bell: BellHopPlatform, elapsedSeconds: number) {
  const motion = bellHopMotion(bell.level);
  return bell.x + Math.sin(elapsedSeconds * motion.speed + bell.level * 1.73) * motion.amplitude;
}

function drawRabbit(
  context: CanvasRenderingContext2D,
  x: number,
  bottomY: number,
  direction: number,
) {
  context.save();
  context.translate(x, bottomY - 4);
  context.rotate(direction * 0.055);
  context.fillStyle = "#f7fbff";
  context.strokeStyle = "#b8d4e4";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(-10, -42, 9, 24, -0.22, 0, Math.PI * 2);
  context.ellipse(10, -42, 9, 24, 0.22, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.ellipse(0, -15, 23, 28, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.arc(0, -35, 19, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#193d57";
  context.beginPath();
  context.arc(-6, -38, 2.2, 0, Math.PI * 2);
  context.arc(6, -38, 2.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#e899a8";
  context.beginPath();
  context.arc(0, -32, 2.4, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#7898ab";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(0, -29);
  context.quadraticCurveTo(-4, -25, -8, -27);
  context.moveTo(0, -29);
  context.quadraticCurveTo(4, -25, 8, -27);
  context.stroke();
  context.fillStyle = "#e7f1f8";
  context.beginPath();
  context.ellipse(-15, 5, 13, 6, -0.12, 0, Math.PI * 2);
  context.ellipse(15, 5, 13, 6, 0.12, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawBell(
  context: CanvasRenderingContext2D,
  bell: BellHopPlatform,
  screenX: number,
  screenY: number,
) {
  const height = Math.max(18, bell.width * 0.34);
  context.save();
  context.translate(screenX, screenY);
  const glow = context.createRadialGradient(0, -height / 2, 2, 0, -height / 2, bell.width * 0.72);
  glow.addColorStop(0, "rgb(255 231 143 / 45%)");
  glow.addColorStop(1, "rgb(255 231 143 / 0%)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(0, -height / 2, bell.width * 0.72, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f7c84b";
  context.strokeStyle = "#9e6824";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-bell.width / 2, 0);
  context.quadraticCurveTo(-bell.width * 0.36, -height, 0, -height);
  context.quadraticCurveTo(bell.width * 0.36, -height, bell.width / 2, 0);
  context.quadraticCurveTo(0, height * 0.22, -bell.width / 2, 0);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff1a8";
  context.beginPath();
  context.ellipse(
    -bell.width * 0.17,
    -height * 0.55,
    bell.width * 0.08,
    height * 0.28,
    -0.5,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = "#a66b25";
  context.beginPath();
  context.arc(0, height * 0.14, Math.max(4, bell.width * 0.06), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawScene(canvas: HTMLCanvasElement, runtime: Runtime, targetX: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== BELL_HOP_WIDTH * ratio || canvas.height !== BELL_HOP_HEIGHT * ratio) {
    canvas.width = BELL_HOP_WIDTH * ratio;
    canvas.height = BELL_HOP_HEIGHT * ratio;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const sky = context.createLinearGradient(0, 0, 0, BELL_HOP_HEIGHT);
  sky.addColorStop(0, "#183f68");
  sky.addColorStop(0.48, "#4f8eb3");
  sky.addColorStop(1, "#c9e8ee");
  context.fillStyle = sky;
  context.fillRect(0, 0, BELL_HOP_WIDTH, BELL_HOP_HEIGHT);

  context.fillStyle = "rgb(255 255 255 / 72%)";
  for (const flake of runtime.snow) {
    context.beginPath();
    context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    context.fill();
  }

  const elapsed = (performance.now() - runtime.startedAt) / 1_000;
  for (let index = 0; index < 6; index += 1) {
    const cloudWorldY = 260 + index * 420;
    const y = BELL_HOP_HEIGHT - 70 - (cloudWorldY - runtime.cameraY);
    if (y < -100 || y > BELL_HOP_HEIGHT + 100) continue;
    const x = ((index * 181 + 70) % BELL_HOP_WIDTH) + Math.sin(elapsed * 0.08 + index) * 20;
    context.fillStyle = "rgb(255 255 255 / 20%)";
    context.beginPath();
    context.ellipse(x, y, 95, 24, 0, 0, Math.PI * 2);
    context.ellipse(x + 65, y + 4, 70, 19, 0, 0, Math.PI * 2);
    context.fill();
  }

  const groundY = BELL_HOP_HEIGHT - 70 + runtime.cameraY;
  if (groundY < BELL_HOP_HEIGHT + 80) {
    context.fillStyle = "#eef9fa";
    context.beginPath();
    context.moveTo(0, groundY);
    context.quadraticCurveTo(180, groundY - 28, 360, groundY + 2);
    context.quadraticCurveTo(540, groundY - 20, BELL_HOP_WIDTH, groundY - 4);
    context.lineTo(BELL_HOP_WIDTH, BELL_HOP_HEIGHT);
    context.lineTo(0, BELL_HOP_HEIGHT);
    context.fill();
  }

  for (const bell of runtime.bells) {
    if (bell.hit) continue;
    const y = BELL_HOP_HEIGHT - 70 - (bell.altitude - runtime.cameraY);
    if (y < -80 || y > BELL_HOP_HEIGHT + 50) continue;
    drawBell(context, bell, visibleBellX(bell, elapsed), y);
  }

  const playerScreenY = BELL_HOP_HEIGHT - 70 - (runtime.playerY - runtime.cameraY);
  drawRabbit(
    context,
    runtime.playerX,
    playerScreenY,
    Math.max(-1, Math.min(1, (targetX - runtime.playerX) / 90)),
  );
}

function PeriodRanking({ title, period }: { title: string; period: BellHopLeaderboards["week"] }) {
  return (
    <section className="card bell-hop-ranking-card">
      <div className="card-header">
        <div>
          <div className="eyebrow">Recordes</div>
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
              <strong>{entry.score.toLocaleString("pt-BR")} pts</strong>
              <span className="muted small">
                {entry.attempts} tentativa{entry.attempts === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">O primeiro recorde da turma pode ser seu.</p>
      )}
    </section>
  );
}

export function BellHopGame({
  communityId,
  communitySlug,
  initialLeaderboards,
}: {
  communityId: string;
  communitySlug: string;
  initialLeaderboards: BellHopLeaderboards;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const frameRef = useRef<number | null>(null);
  const targetXRef = useRef(BELL_HOP_WIDTH / 2);
  const finishingRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [score, setScore] = useState(0);
  const [bellsHit, setBellsHit] = useState(0);
  const [height, setHeight] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [leaderboards, setLeaderboards] = useState(initialLeaderboards);
  const baseUrl = `/api/communities/${communityId}/games/bell-hop/runs`;

  const playChime = useCallback(
    (level: number) => {
      if (!soundEnabled) return;
      try {
        const audio = audioRef.current ?? new AudioContext();
        audioRef.current = audio;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 520 + (level % 9) * 38;
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.34);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.36);
      } catch {
        // O jogo continua normalmente quando o navegador bloqueia áudio.
      }
    },
    [soundEnabled],
  );

  const finishGame = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || finishingRef.current) return;
    finishingRef.current = true;
    setGameState("FINISHING");
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const durationMs = Math.max(0, Math.round(performance.now() - runtime.startedAt));
    try {
      const response = await fetch(`${baseUrl}/${runtime.run.id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bellsHit: runtime.bellsHit,
          maxHeight: Math.max(0, Math.floor(runtime.maxHeight)),
          durationMs,
        }),
      });
      const payload = (await response.json()) as {
        run?: { score: number; bellsHit: number; maxHeight: number };
        leaderboards?: BellHopLeaderboards;
        error?: string;
      };
      if (!response.ok || !payload.run) throw new Error(payload.error || "Pontuação não salva.");
      setScore(payload.run.score);
      setBellsHit(payload.run.bellsHit);
      setHeight(payload.run.maxHeight);
      if (payload.leaderboards) setLeaderboards(payload.leaderboards);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a pontuação.");
      setSaved(false);
    } finally {
      setGameState("GAME_OVER");
    }
  }, [baseUrl]);

  useEffect(() => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return;
    let stopped = false;
    const loop = (timestamp: number) => {
      if (stopped || runtimeRef.current !== runtime) return;
      const delta = Math.min(0.034, Math.max(0, (timestamp - runtime.lastFrame) / 1_000));
      runtime.lastFrame = timestamp;
      const elapsedSeconds = (timestamp - runtime.startedAt) / 1_000;
      runtime.playerX +=
        (targetXRef.current - runtime.playerX) * Math.min(1, Math.max(0.08, delta * 9));
      const previousY = runtime.playerY;
      runtime.velocityY -= 1_180 * delta;
      runtime.playerY += runtime.velocityY * delta;
      runtime.maxHeight = Math.max(runtime.maxHeight, runtime.playerY);

      if (runtime.velocityY < 0) {
        const landing = runtime.bells
          .filter((bell) => {
            if (bell.hit || previousY < bell.altitude || runtime.playerY > bell.altitude)
              return false;
            const x = visibleBellX(bell, elapsedSeconds);
            return Math.abs(runtime.playerX - x) <= bell.width / 2 + 15;
          })
          .sort((left, right) => right.altitude - left.altitude)[0];
        if (landing) {
          landing.hit = true;
          runtime.playerY = landing.altitude;
          runtime.velocityY = Math.min(770, 690 + runtime.bellsHit * 1.4);
          runtime.bellsHit += 1;
          const nextScore = bellHopScore(runtime.bellsHit);
          setBellsHit(runtime.bellsHit);
          setScore(nextScore);
          playChime(landing.level);
        }
      }

      if (runtime.playerY - runtime.cameraY > 420) runtime.cameraY = runtime.playerY - 420;
      while (
        bellHopPlatform(runtime.run.seed, runtime.nextLevel).altitude <
        runtime.cameraY + 930
      ) {
        runtime.bells.push({
          ...bellHopPlatform(runtime.run.seed, runtime.nextLevel),
          hit: false,
        });
        runtime.nextLevel += 1;
      }
      runtime.bells = runtime.bells.filter((bell) => bell.altitude > runtime.cameraY - 180);
      for (const flake of runtime.snow) {
        flake.y += flake.speed * delta;
        flake.x += Math.sin(elapsedSeconds + flake.y * 0.01) * flake.drift * delta;
        if (flake.y > BELL_HOP_HEIGHT + 5) {
          flake.y = -5;
          flake.x = (flake.x + 173) % BELL_HOP_WIDTH;
        }
        if (flake.x < -5) flake.x = BELL_HOP_WIDTH + 5;
        if (flake.x > BELL_HOP_WIDTH + 5) flake.x = -5;
      }
      if (timestamp - runtime.lastHudAt > 120) {
        runtime.lastHudAt = timestamp;
        setHeight(Math.max(0, Math.floor(runtime.maxHeight)));
      }
      drawScene(canvas, runtime, targetXRef.current);
      if (runtime.playerY < runtime.cameraY - 135 && runtime.velocityY < 0) {
        void finishGame();
        return;
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [finishGame, gameState, playChime]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      void audioRef.current?.close();
    },
    [],
  );

  async function startGame() {
    setGameState("STARTING");
    setError("");
    setSaved(false);
    try {
      const response = await fetch(baseUrl, { method: "POST" });
      const payload = (await response.json()) as { run?: ActiveRun; error?: string };
      if (!response.ok || !payload.run)
        throw new Error(payload.error || "Não foi possível iniciar.");
      const now = performance.now();
      const bells = Array.from({ length: 12 }, (_, index) => ({
        ...bellHopPlatform(payload.run!.seed, index + 1),
        hit: false,
      }));
      runtimeRef.current = {
        run: payload.run,
        playerX: BELL_HOP_WIDTH / 2,
        playerY: 0,
        velocityY: 700,
        cameraY: 0,
        maxHeight: 0,
        bellsHit: 0,
        bells,
        nextLevel: 13,
        startedAt: now,
        lastFrame: now,
        lastHudAt: now,
        snow: createSnow(payload.run.seed),
      };
      targetXRef.current = BELL_HOP_WIDTH / 2;
      finishingRef.current = false;
      setScore(0);
      setBellsHit(0);
      setHeight(0);
      if (soundEnabled) {
        try {
          audioRef.current ??= new AudioContext();
          void audioRef.current.resume();
        } catch {
          // Áudio é opcional e nunca impede o início da partida.
        }
      }
      setGameState("PLAYING");
      requestAnimationFrame(() => canvasRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o jogo.");
      setGameState("IDLE");
    }
  }

  function movePointer(clientX: number) {
    const rectangle = canvasRef.current?.getBoundingClientRect();
    if (!rectangle) return;
    targetXRef.current = Math.max(
      24,
      Math.min(
        BELL_HOP_WIDTH - 24,
        ((clientX - rectangle.left) / rectangle.width) * BELL_HOP_WIDTH,
      ),
    );
  }

  return (
    <>
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
      </Link>
      <div className="page-heading bell-hop-heading">
        <div>
          <div className="eyebrow">Arcade solo</div>
          <h1>Salto dos Sinos</h1>
          <p className="lead">
            Mova o coelho com o mouse ou o dedo. Cada sino dá um novo impulso — não deixe cair.
          </p>
        </div>
        <button
          aria-pressed={soundEnabled}
          className="button secondary bell-hop-sound"
          onClick={() => setSoundEnabled((enabled) => !enabled)}
          type="button"
        >
          {soundEnabled ? "Som ligado" : "Som desligado"}
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="bell-hop-layout">
        <section className="card bell-hop-game-card">
          <div className="bell-hop-hud" aria-live="polite">
            <span>
              <small>Pontos</small>
              <strong>{score.toLocaleString("pt-BR")}</strong>
            </span>
            <span>
              <small>Sinos</small>
              <strong>{bellsHit}</strong>
            </span>
            <span>
              <small>Altura</small>
              <strong>{height} m</strong>
            </span>
          </div>
          <div className="bell-hop-canvas-wrap">
            <canvas
              aria-label="Área do jogo Salto dos Sinos. Mova o ponteiro horizontalmente para controlar o coelho."
              className="bell-hop-canvas"
              height={BELL_HOP_HEIGHT}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                targetXRef.current = Math.max(
                  24,
                  Math.min(
                    BELL_HOP_WIDTH - 24,
                    targetXRef.current + (event.key === "ArrowLeft" ? -55 : 55),
                  ),
                );
              }}
              onPointerMove={(event) => movePointer(event.clientX)}
              ref={canvasRef}
              role="img"
              tabIndex={0}
              width={BELL_HOP_WIDTH}
            />
            {gameState !== "PLAYING" && (
              <div className="bell-hop-overlay">
                {gameState === "GAME_OVER" ? (
                  <>
                    <div className="eyebrow">Fim da subida</div>
                    <h2>{score.toLocaleString("pt-BR")} pontos</h2>
                    <p>
                      Você alcançou {bellsHit} sino{bellsHit === 1 ? "" : "s"} e {height} metros.
                      {saved ? " Recorde salvo no ranking." : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="eyebrow">Uma vida · subida infinita</div>
                    <h2>Até onde você consegue chegar?</h2>
                    <p>Os sinos ficam menores e cada novo salto vale mais pontos.</p>
                  </>
                )}
                <button
                  className="button"
                  disabled={gameState === "STARTING" || gameState === "FINISHING"}
                  onClick={() => void startGame()}
                  type="button"
                >
                  {gameState === "STARTING"
                    ? "Preparando…"
                    : gameState === "FINISHING"
                      ? "Salvando…"
                      : gameState === "GAME_OVER"
                        ? "Jogar novamente"
                        : "Começar subida"}
                </button>
                <small>Também funciona com as setas ← →.</small>
              </div>
            )}
          </div>
          <p className="muted small bell-hop-help">
            O salto é automático. Posicione o coelho sobre um sino enquanto ele estiver descendo.
          </p>
        </section>

        <aside className="bell-hop-side">
          <PeriodRanking period={leaderboards.week} title="Melhores da semana" />
          <PeriodRanking period={leaderboards.month} title="Melhores do mês" />
        </aside>
      </div>
    </>
  );
}
