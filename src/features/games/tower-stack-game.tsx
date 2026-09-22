"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TOWER_STACK_BLOCK_HEIGHT,
  TOWER_STACK_CRANE_CLEARANCE,
  TOWER_STACK_HEIGHT,
  TOWER_STACK_LIVES,
  TOWER_STACK_ROPE_LENGTH,
  TOWER_STACK_WIDTH,
  calculateTowerStability,
  towerBlockSpec,
  towerOverlap,
  towerStackHeight,
  towerStackScore,
  towerTangentialTransfer,
  towerRejectionBounce,
  type TowerBlock,
} from "@/lib/games/tower-stack";
import type { TowerStackLeaderboards } from "@/server/services/tower-stack-service";

type GameState = "IDLE" | "STARTING" | "PLAYING" | "FINISHING" | "GAME_OVER";
type Phase = "SWINGING" | "DROPPING";

type ActiveRun = { id: string; seed: number; startedAt: string };

type PlacedBlock = TowerBlock & {
  level: number;
  altitude: number;
  rotation: number;
  colorIndex: number;
};

type DroppingBlock = PlacedBlock & {
  velocityX: number;
  velocityY: number;
  angularVelocity: number;
  rejected: boolean;
  impactCount: number;
};

type Runtime = {
  run: ActiveRun;
  blocks: PlacedBlock[];
  dropping: DroppingBlock | null;
  phase: Phase;
  dropReady: boolean;
  lives: number;
  blocksPlaced: number;
  cameraY: number;
  swingStartedAt: number;
  startedAt: number;
  lastFrame: number;
};

const BLOCK_COLORS = ["#ee7d52", "#f2b84b", "#63a78f", "#628ec7", "#956eb2"];
const BASE_WIDTH = 244;
const GROUND_Y = TOWER_STACK_HEIGHT - 88;
const WORLD_SCALE = 0.84;

function formatPeriod(startDate: string, endDate: string) {
  const format = (value: string) => value.split("-").reverse().join("/");
  return `${format(startDate)} a ${format(endDate)}`;
}

function swingPosition(runtime: Runtime, timestamp: number) {
  const level = runtime.blocksPlaced + 1;
  const spec = towerBlockSpec(runtime.run.seed, level);
  const elapsed = Math.max(0, timestamp - runtime.swingStartedAt) / 1_000;
  const wave = elapsed * spec.swingSpeed;
  const ropeAngle = Math.sin(wave) * 1.08 * spec.direction;
  const pivotAltitude =
    runtime.blocks.length * TOWER_STACK_BLOCK_HEIGHT + TOWER_STACK_CRANE_CLEARANCE;
  return {
    level,
    spec,
    pivotX: TOWER_STACK_WIDTH / 2,
    pivotAltitude,
    x: TOWER_STACK_WIDTH / 2 + Math.sin(ropeAngle) * spec.swingAmplitude,
    altitude:
      pivotAltitude - Math.cos(ropeAngle) * TOWER_STACK_ROPE_LENGTH - TOWER_STACK_BLOCK_HEIGHT / 2,
    rotation: ropeAngle * 0.2,
    velocityX:
      Math.cos(ropeAngle) *
      Math.cos(wave) *
      spec.swingSpeed *
      spec.swingAmplitude *
      1.08 *
      spec.direction,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawBlock(
  context: CanvasRenderingContext2D,
  block: PlacedBlock,
  screenX: number,
  screenY: number,
  rotation: number,
) {
  context.save();
  context.translate(screenX, screenY);
  context.rotate(rotation);
  context.shadowColor = "rgb(45 30 40 / 24%)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 5;
  roundedRect(
    context,
    -block.width / 2,
    -TOWER_STACK_BLOCK_HEIGHT / 2,
    block.width,
    TOWER_STACK_BLOCK_HEIGHT,
    8,
  );
  context.fillStyle = BLOCK_COLORS[block.colorIndex % BLOCK_COLORS.length];
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "rgb(67 49 58 / 58%)";
  context.lineWidth = 2;
  context.stroke();

  if (block.level > 0) {
    context.fillStyle = "rgb(255 244 199 / 86%)";
    const windowCount = Math.max(2, Math.floor(block.width / 45));
    const gap = block.width / (windowCount + 1);
    for (let index = 1; index <= windowCount; index += 1) {
      roundedRect(context, -block.width / 2 + gap * index - 7, -11, 14, 19, 3);
      context.fill();
    }
    context.fillStyle = "rgb(255 255 255 / 32%)";
    roundedRect(
      context,
      -block.width / 2 + 8,
      -TOWER_STACK_BLOCK_HEIGHT / 2 + 6,
      block.width - 16,
      5,
      3,
    );
    context.fill();
  }
  context.restore();
}

function drawScene(canvas: HTMLCanvasElement, runtime: Runtime, timestamp: number) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== TOWER_STACK_WIDTH * ratio || canvas.height !== TOWER_STACK_HEIGHT * ratio) {
    canvas.width = TOWER_STACK_WIDTH * ratio;
    canvas.height = TOWER_STACK_HEIGHT * ratio;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const sky = context.createLinearGradient(0, 0, 0, TOWER_STACK_HEIGHT);
  sky.addColorStop(0, "#28355f");
  sky.addColorStop(0.5, "#d47072");
  sky.addColorStop(1, "#f8c977");
  context.fillStyle = sky;
  context.fillRect(0, 0, TOWER_STACK_WIDTH, TOWER_STACK_HEIGHT);

  const cameraTarget = Math.max(
    0,
    runtime.blocks.length * TOWER_STACK_BLOCK_HEIGHT - TOWER_STACK_HEIGHT * 0.24,
  );
  runtime.cameraY += (cameraTarget - runtime.cameraY) * 0.06;
  const toScreenY = (altitude: number) => GROUND_Y - (altitude - runtime.cameraY);

  context.fillStyle = "rgb(255 224 170 / 48%)";
  context.beginPath();
  context.arc(105, 135, 58, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgb(45 44 72 / 34%)";
  for (let index = 0; index < 12; index += 1) {
    const buildingHeight = 70 + ((index * 47) % 155);
    const width = 68;
    const x = index * 65 - 20;
    const y = GROUND_Y + runtime.cameraY - buildingHeight;
    context.fillRect(x, y, width, buildingHeight + 120);
  }

  context.save();
  context.translate(TOWER_STACK_WIDTH / 2, GROUND_Y);
  context.scale(WORLD_SCALE, WORLD_SCALE);
  context.translate(-TOWER_STACK_WIDTH / 2, -GROUND_Y);

  const stability = calculateTowerStability(runtime.blocks);
  const elapsed = (timestamp - runtime.startedAt) / 1_000;
  const sway = Math.sin(elapsed * (0.75 + runtime.blocksPlaced * 0.018)) * stability.lean * 13;
  for (const block of runtime.blocks) {
    const heightRatio = block.level / Math.max(1, runtime.blocks.length - 1);
    const screenX = block.x + sway * heightRatio;
    const screenY = toScreenY(block.altitude + TOWER_STACK_BLOCK_HEIGHT / 2);
    drawBlock(context, block, screenX, screenY, block.rotation + sway * heightRatio * 0.0015);
  }

  if (runtime.phase === "SWINGING") {
    const hanging = swingPosition(runtime, timestamp);
    const pivotY = toScreenY(hanging.pivotAltitude);
    const blockY = toScreenY(hanging.altitude + TOWER_STACK_BLOCK_HEIGHT / 2);
    context.strokeStyle = "#493f4d";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(hanging.pivotX, pivotY);
    context.lineTo(hanging.x, blockY - TOWER_STACK_BLOCK_HEIGHT / 2);
    context.stroke();
    context.fillStyle = "#34354b";
    context.fillRect(hanging.pivotX - 82, pivotY - 9, 164, 13);
    drawBlock(
      context,
      {
        level: hanging.level,
        x: hanging.x,
        width: hanging.spec.width,
        altitude: hanging.altitude,
        rotation: hanging.rotation,
        colorIndex: hanging.spec.colorIndex,
      },
      hanging.x,
      blockY,
      hanging.rotation,
    );
  }

  if (runtime.dropping) {
    const block = runtime.dropping;
    drawBlock(
      context,
      block,
      block.x,
      toScreenY(block.altitude + TOWER_STACK_BLOCK_HEIGHT / 2),
      block.rotation,
    );
  }
  context.restore();

  const groundScreenY = toScreenY(0);
  if (groundScreenY < TOWER_STACK_HEIGHT + 80) {
    const ground = context.createLinearGradient(0, groundScreenY, 0, TOWER_STACK_HEIGHT);
    ground.addColorStop(0, "#38364a");
    ground.addColorStop(1, "#22263c");
    context.fillStyle = ground;
    context.fillRect(0, groundScreenY, TOWER_STACK_WIDTH, TOWER_STACK_HEIGHT - groundScreenY);
  }
}

function PeriodRanking({
  title,
  period,
}: {
  title: string;
  period: TowerStackLeaderboards["week"];
}) {
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
              <strong>{entry.blocksPlaced} andares</strong>
              <span className="muted small">
                {entry.score.toLocaleString("pt-BR")} pts · {entry.attempts} tentativa
                {entry.attempts === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Construa a primeira torre da turma.</p>
      )}
    </section>
  );
}

export function TowerStackGame({
  communityId,
  communitySlug,
  initialLeaderboards,
}: {
  communityId: string;
  communitySlug: string;
  initialLeaderboards: TowerStackLeaderboards;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const frameRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const [score, setScore] = useState(0);
  const [blocksPlaced, setBlocksPlaced] = useState(0);
  const [lives, setLives] = useState(TOWER_STACK_LIVES);
  const [statusMessage, setStatusMessage] = useState("A torre espera o primeiro andar.");
  const [canDrop, setCanDrop] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [leaderboards, setLeaderboards] = useState(initialLeaderboards);
  const baseUrl = `/api/communities/${communityId}/games/tower-stack/runs`;

  const playSound = useCallback(
    (kind: "LAND" | "MISS") => {
      if (!soundEnabled) return;
      try {
        const audio = audioRef.current ?? new AudioContext();
        audioRef.current = audio;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = kind === "LAND" ? "triangle" : "sawtooth";
        oscillator.frequency.setValueAtTime(kind === "LAND" ? 180 : 115, audio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
          kind === "LAND" ? 95 : 55,
          audio.currentTime + 0.2,
        );
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          kind === "LAND" ? 0.13 : 0.09,
          audio.currentTime + 0.01,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.24);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.26);
      } catch {
        // O áudio é opcional e nunca interrompe o jogo.
      }
    },
    [soundEnabled],
  );

  const finishGame = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime || finishingRef.current) return;
    finishingRef.current = true;
    setGameState("FINISHING");
    setCanDrop(false);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    const durationMs = Math.max(0, Math.round(performance.now() - runtime.startedAt));
    try {
      const response = await fetch(`${baseUrl}/${runtime.run.id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blocksPlaced: runtime.blocksPlaced,
          livesRemaining: 0,
          durationMs,
        }),
      });
      const payload = (await response.json()) as {
        run?: { score: number; blocksPlaced: number; maxHeight: number };
        leaderboards?: TowerStackLeaderboards;
        error?: string;
      };
      if (!response.ok || !payload.run) throw new Error(payload.error || "Pontuação não salva.");
      setScore(payload.run.score);
      setBlocksPlaced(payload.run.blocksPlaced);
      if (payload.leaderboards) setLeaderboards(payload.leaderboards);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a pontuação.");
      setSaved(false);
    } finally {
      setStatusMessage("A construção terminou após três quedas.");
      setGameState("GAME_OVER");
    }
  }, [baseUrl]);

  useEffect(() => {
    if (gameState !== "PLAYING") return;
    const canvas = canvasRef.current;
    const runtime = runtimeRef.current;
    if (!canvas || !runtime) return;
    let stopped = false;

    const loseLife = (timestamp: number) => {
      runtime.dropping = null;
      runtime.lives -= 1;
      setLives(runtime.lives);
      playSound("MISS");
      if (runtime.lives === 0) {
        void finishGame();
        return;
      }
      runtime.phase = "SWINGING";
      runtime.dropReady = false;
      runtime.swingStartedAt = timestamp + 450;
      setCanDrop(false);
      setStatusMessage(
        `O bloco caiu. Restam ${runtime.lives} vida${runtime.lives === 1 ? "" : "s"}.`,
      );
    };

    const loop = (timestamp: number) => {
      if (stopped || runtimeRef.current !== runtime) return;
      const delta = Math.min(0.034, Math.max(0, (timestamp - runtime.lastFrame) / 1_000));
      runtime.lastFrame = timestamp;

      if (
        runtime.phase === "SWINGING" &&
        !runtime.dropReady &&
        timestamp >= runtime.swingStartedAt
      ) {
        runtime.dropReady = true;
        setCanDrop(true);
      }

      if (runtime.phase === "DROPPING" && runtime.dropping) {
        const block = runtime.dropping;
        const previousAltitude = block.altitude;
        block.velocityY -= 1_250 * delta;
        block.altitude += block.velocityY * delta;
        block.x += block.velocityX * delta;
        block.rotation += block.angularVelocity * delta;
        const supportAltitude = runtime.blocks.length * TOWER_STACK_BLOCK_HEIGHT;
        const crossedTop =
          block.velocityY < 0 &&
          previousAltitude > supportAltitude &&
          block.altitude <= supportAltitude;

        if (block.velocityY < 0) {
          let collision:
            | { support: PlacedBlock; supportIndex: number; altitude: number; overlap: number }
            | undefined;
          for (let index = runtime.blocks.length - 1; index >= 0; index -= 1) {
            const support = runtime.blocks[index];
            const altitude = support.altitude + TOWER_STACK_BLOCK_HEIGHT;
            if (previousAltitude > altitude && block.altitude <= altitude) {
              const overlap = towerOverlap(support, block);
              if (overlap > 0) {
                collision = { support, supportIndex: index, altitude, overlap };
                break;
              }
            }
          }

          let rejectionMessage = "";
          if (
            collision &&
            !block.rejected &&
            collision.supportIndex === runtime.blocks.length - 1 &&
            collision.overlap >= 10
          ) {
            const support = collision.support;
            const offset = block.x - support.x;
            if (Math.abs(offset) <= 5) block.x = support.x;
            const placed: PlacedBlock = {
              level: block.level,
              x: block.x,
              width: block.width,
              altitude: collision.altitude,
              rotation: Math.max(-0.1, Math.min(0.1, (block.x - support.x) / support.width / 2)),
              colorIndex: block.colorIndex,
            };
            const stability = calculateTowerStability([...runtime.blocks, placed]);
            if (stability.stable) {
              runtime.blocks.push(placed);
              runtime.blocksPlaced += 1;
              runtime.dropping = null;
              runtime.phase = "SWINGING";
              runtime.dropReady = false;
              runtime.swingStartedAt = timestamp + 320;
              const nextScore = towerStackScore(runtime.blocksPlaced);
              setBlocksPlaced(runtime.blocksPlaced);
              setScore(nextScore);
              setCanDrop(false);
              setStatusMessage(
                Math.abs(offset) <= 5
                  ? `Encaixe perfeito no andar ${runtime.blocksPlaced}.`
                  : `Andar ${runtime.blocksPlaced} firme, com ${Math.round(stability.lean * 100)}% de inclinação.`,
              );
              playSound("LAND");
            } else {
              rejectionMessage = "O centro de massa saiu do apoio — o bloco ricocheteou.";
            }
          }

          if (runtime.dropping === block && collision) {
            const offset = block.x - collision.support.x;
            block.rejected = true;
            block.impactCount += 1;
            block.altitude = collision.altitude + 0.5;
            Object.assign(block, towerRejectionBounce(offset, block.velocityX, block.impactCount));
            setStatusMessage(
              rejectionMessage ||
                (collision.supportIndex === runtime.blocks.length - 1
                  ? "O bloco bateu na ponta e ricocheteou."
                  : "O bloco atingiu a lateral da torre e ricocheteou."),
            );
          } else if (runtime.dropping === block && !block.rejected && crossedTop) {
            block.rejected = true;
            setStatusMessage("O bloco não encontrou apoio.");
          }
        }

        if (
          block.rejected &&
          (block.altitude < runtime.cameraY - 130 ||
            block.x < -block.width ||
            block.x > TOWER_STACK_WIDTH + block.width)
        ) {
          loseLife(timestamp);
          if (runtime.lives === 0) return;
        }
      }

      drawScene(canvas, runtime, timestamp);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [finishGame, gameState, playSound]);

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
      runtimeRef.current = {
        run: payload.run,
        blocks: [
          {
            level: 0,
            x: TOWER_STACK_WIDTH / 2,
            width: BASE_WIDTH,
            altitude: 0,
            rotation: 0,
            colorIndex: 3,
          },
        ],
        dropping: null,
        phase: "SWINGING",
        dropReady: true,
        lives: TOWER_STACK_LIVES,
        blocksPlaced: 0,
        cameraY: 0,
        swingStartedAt: now,
        startedAt: now,
        lastFrame: now,
      };
      finishingRef.current = false;
      setScore(0);
      setBlocksPlaced(0);
      setLives(TOWER_STACK_LIVES);
      setCanDrop(true);
      setStatusMessage("Bloco 1 no pêndulo. Toque para soltar.");
      if (soundEnabled) {
        try {
          audioRef.current ??= new AudioContext();
          void audioRef.current.resume();
        } catch {
          // Áudio opcional.
        }
      }
      setGameState("PLAYING");
      requestAnimationFrame(() => canvasRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o jogo.");
      setGameState("IDLE");
    }
  }

  const dropBlock = useCallback(() => {
    const runtime = runtimeRef.current;
    if (gameState !== "PLAYING" || !runtime || runtime.phase !== "SWINGING" || !runtime.dropReady)
      return;
    const hanging = swingPosition(runtime, performance.now());
    runtime.dropping = {
      level: hanging.level,
      x: hanging.x,
      width: hanging.spec.width,
      altitude: hanging.altitude,
      rotation: hanging.rotation,
      colorIndex: hanging.spec.colorIndex,
      // A posição no instante da soltura é a principal habilidade; preservamos apenas
      // uma pequena parte da velocidade tangencial para o bloco não parecer artificial.
      velocityX: hanging.velocityX * towerTangentialTransfer(hanging.level),
      velocityY: -25,
      angularVelocity: hanging.velocityX / 1_600,
      rejected: false,
      impactCount: 0,
    };
    runtime.phase = "DROPPING";
    runtime.dropReady = false;
    setCanDrop(false);
    setStatusMessage(`Andar ${hanging.level} em queda…`);
  }, [gameState]);

  return (
    <>
      <Link className="back-link" href={`/app/${communitySlug}/games`}>
        ← Voltar aos jogos
      </Link>
      <div className="page-heading bell-hop-heading">
        <div>
          <div className="eyebrow">Arcade solo · equilíbrio</div>
          <h1>Torre em Equilíbrio</h1>
          <p className="lead">
            Solte cada andar no momento certo. A torre pode inclinar e balançar — só não deixe o
            peso escapar da base.
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
        <section className="card bell-hop-game-card tower-stack-card">
          <div className="bell-hop-hud tower-stack-hud" aria-live="polite">
            <span>
              <small>Pontos</small>
              <strong>{score.toLocaleString("pt-BR")}</strong>
            </span>
            <span>
              <small>Andares</small>
              <strong>{blocksPlaced}</strong>
            </span>
            <span>
              <small>Altura</small>
              <strong>{towerStackHeight(blocksPlaced)} m</strong>
            </span>
            <span>
              <small>Vidas</small>
              <strong aria-label={`${lives} vidas restantes`}>{"♥".repeat(lives) || "—"}</strong>
            </span>
          </div>
          <div className="bell-hop-canvas-wrap tower-stack-canvas-wrap">
            <canvas
              aria-label="Área do jogo Torre em Equilíbrio. Toque, clique ou pressione espaço para soltar o bloco."
              className="bell-hop-canvas tower-stack-canvas"
              height={TOWER_STACK_HEIGHT}
              onKeyDown={(event) => {
                if (event.key !== " " && event.key !== "Enter") return;
                event.preventDefault();
                dropBlock();
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                dropBlock();
              }}
              ref={canvasRef}
              role="img"
              tabIndex={0}
              width={TOWER_STACK_WIDTH}
            />
            {gameState !== "PLAYING" && (
              <div className="bell-hop-overlay tower-stack-overlay">
                {gameState === "GAME_OVER" ? (
                  <>
                    <div className="eyebrow">Construção encerrada</div>
                    <h2>{blocksPlaced} andares</h2>
                    <p>
                      Sua torre chegou a {towerStackHeight(blocksPlaced)} metros e marcou{" "}
                      {score.toLocaleString("pt-BR")} pontos.
                      {saved ? " Resultado salvo no ranking." : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="eyebrow">3 vidas · torre infinita</div>
                    <h2>Quanto equilíbrio você tem?</h2>
                    <p>O pêndulo acelera e a torre balança mais conforme ganha altura.</p>
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
                        ? "Construir novamente"
                        : "Começar construção"}
                </button>
                <small>Use toque, clique, espaço ou Enter.</small>
              </div>
            )}
          </div>
          <div className="tower-stack-controls">
            <button
              className="button"
              disabled={gameState !== "PLAYING" || !canDrop}
              onClick={dropBlock}
              type="button"
            >
              Soltar bloco
            </button>
            <p className="muted small" role="status">
              {statusMessage}
            </p>
          </div>
        </section>

        <aside className="bell-hop-side">
          <section className="card tower-stack-rules">
            <div className="eyebrow">Como funciona</div>
            <h2>Equilibre o peso</h2>
            <ul>
              <li>Um encaixe fora do centro faz a torre pender e balançar.</li>
              <li>Ela continua de pé enquanto o centro de massa permanece apoiado.</li>
              <li>Cada bloco perdido consome uma das três vidas.</li>
              <li>Andares mais altos valem progressivamente mais pontos.</li>
            </ul>
          </section>
          <PeriodRanking period={leaderboards.week} title="Torres da semana" />
          <PeriodRanking period={leaderboards.month} title="Torres do mês" />
        </aside>
      </div>
    </>
  );
}
