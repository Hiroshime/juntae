import type {
  ArenaBattleAction,
  ArenaBattleActor,
  ArenaBattleEvent,
} from "@/lib/games/arena-battle";

export type ArenaFighterMotion =
  "idle" | "walk" | "attack" | "power-attack" | "guard" | "block" | "hit" | "recover" | "knockout";

export type ArenaAnimationCue = {
  player: ArenaFighterMotion;
  opponent: ArenaFighterMotion;
  duration: number;
};

export type ArenaCombatEffect = {
  actor: ArenaBattleActor;
  kind: "damage" | "blocked" | "miss" | "guard" | "recover" | "move" | "knockout";
  icon: string;
  label: string;
  detail: string;
  announcement: string;
};

type AnimationTurn = {
  playerAction: ArenaBattleAction;
  opponentAction: ArenaBattleAction;
  events: ArenaBattleEvent[];
};

type InitialGuard = {
  player: boolean;
  opponent: boolean;
};

function otherActor(actor: ArenaBattleActor): ArenaBattleActor {
  return actor === "PLAYER" ? "OPPONENT" : "PLAYER";
}

function attackMotion(action: ArenaBattleAction): ArenaFighterMotion {
  return action === "POWER_STRIKE" ? "power-attack" : "attack";
}

function actionFor(turn: AnimationTurn, actor: ArenaBattleActor) {
  return actor === "PLAYER" ? turn.playerAction : turn.opponentAction;
}

function cueFor(
  actor: ArenaBattleActor,
  actorMotion: ArenaFighterMotion,
  targetMotion: ArenaFighterMotion = "idle",
  duration = 560,
): ArenaAnimationCue {
  return actor === "PLAYER"
    ? { player: actorMotion, opponent: targetMotion, duration }
    : { player: targetMotion, opponent: actorMotion, duration };
}

export function arenaCombatEffect(
  turn: AnimationTurn,
  event: ArenaBattleEvent,
  cue: ArenaAnimationCue,
): ArenaCombatEffect {
  if (event.kind === "HIT") {
    const target = otherActor(event.actor);
    const blocked = (target === "PLAYER" ? cue.player : cue.opponent) === "block";
    return {
      actor: target,
      kind: blocked ? "blocked" : "damage",
      icon: blocked ? "⬡" : "✹",
      label: event.amount === undefined ? "IMPACTO" : `−${event.amount}`,
      detail: blocked ? "BLOQUEADO" : "DANO",
      announcement: event.message,
    };
  }

  if (event.kind === "MISS")
    return {
      actor: event.actor,
      kind: "miss",
      icon: "〰",
      label: "ERROU",
      detail: "SEM DANO",
      announcement: event.message,
    };

  if (event.kind === "GUARD")
    return {
      actor: event.actor,
      kind: "guard",
      icon: "⬡",
      label: "GUARDA",
      detail: "PROTEÇÃO ATIVA",
      announcement: event.message,
    };

  if (event.kind === "RECOVER")
    return {
      actor: event.actor,
      kind: "recover",
      icon: "+",
      label: "FÔLEGO",
      detail: "ENERGIA RECUPERADA",
      announcement: event.message,
    };

  if (event.kind === "MOVE") {
    const action = actionFor(turn, event.actor);
    return {
      actor: event.actor,
      kind: "move",
      icon: action === "ADVANCE" ? "→" : "←",
      label: action === "ADVANCE" ? "AVANÇA" : "RECUA",
      detail: `${event.amount ?? 0} CASA${event.amount === 1 ? "" : "S"}`,
      announcement: event.message,
    };
  }

  return {
    actor: otherActor(event.actor),
    kind: "knockout",
    icon: "✦",
    label: "NOCAUTE",
    detail: "FIM DO DUELO",
    announcement: event.message,
  };
}

export function buildArenaAnimationCues(
  turn: AnimationTurn,
  initialGuard: InitialGuard,
): ArenaAnimationCue[] {
  const guarded = new Set<ArenaBattleActor>();
  if (initialGuard.player) guarded.add("PLAYER");
  if (initialGuard.opponent) guarded.add("OPPONENT");

  return turn.events.map((event) => {
    if (event.kind === "MOVE") return cueFor(event.actor, "walk", "idle", 520);
    if (event.kind === "GUARD") {
      guarded.add(event.actor);
      return cueFor(event.actor, "guard", "idle", 520);
    }
    if (event.kind === "RECOVER") return cueFor(event.actor, "recover", "idle", 560);
    if (event.kind === "MISS")
      return cueFor(event.actor, attackMotion(actionFor(turn, event.actor)), "idle", 560);
    if (event.kind === "HIT") {
      const target = otherActor(event.actor);
      const targetMotion = guarded.has(target) ? "block" : "hit";
      guarded.delete(target);
      return cueFor(event.actor, attackMotion(actionFor(turn, event.actor)), targetMotion, 620);
    }

    return cueFor(otherActor(event.actor), "knockout", "idle", 760);
  });
}
