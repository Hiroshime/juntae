import { describe, expect, it } from "vitest";
import { arenaCombatEffect, buildArenaAnimationCues } from "@/lib/games/arena-battle-animation";

describe("animações do combate da Arena", () => {
  it("converte movimento, ataque e dano em uma sequência ordenada", () => {
    expect(
      buildArenaAnimationCues(
        {
          playerAction: "ADVANCE",
          opponentAction: "QUICK_STRIKE",
          events: [
            { actor: "PLAYER", kind: "MOVE", message: "Avançou." },
            { actor: "OPPONENT", kind: "HIT", message: "Acertou.", amount: 5 },
          ],
        },
        { player: false, opponent: false },
      ),
    ).toEqual([
      { player: "walk", opponent: "idle", duration: 520 },
      { player: "hit", opponent: "attack", duration: 620 },
    ]);
  });

  it("mostra bloqueio quando a guarda veio da rodada anterior", () => {
    const [cue] = buildArenaAnimationCues(
      {
        playerAction: "GUARD",
        opponentAction: "POWER_STRIKE",
        events: [{ actor: "OPPONENT", kind: "HIT", message: "Dano contra a guarda.", amount: 2 }],
      },
      { player: true, opponent: false },
    );

    expect(cue).toEqual({ player: "block", opponent: "power-attack", duration: 620 });
  });

  it("mantém a guarda criada antes do golpe na mesma rodada", () => {
    expect(
      buildArenaAnimationCues(
        {
          playerAction: "GUARD",
          opponentAction: "QUICK_STRIKE",
          events: [
            { actor: "PLAYER", kind: "GUARD", message: "Firmou a guarda." },
            { actor: "OPPONENT", kind: "HIT", message: "Dano contra a guarda.", amount: 3 },
          ],
        },
        { player: false, opponent: false },
      ).map(({ player, opponent }) => ({ player, opponent })),
    ).toEqual([
      { player: "guard", opponent: "idle" },
      { player: "block", opponent: "attack" },
    ]);
  });

  it("derruba o perdedor indicado pelo evento de nocaute", () => {
    const [cue] = buildArenaAnimationCues(
      {
        playerAction: "POWER_STRIKE",
        opponentAction: "GUARD",
        events: [{ actor: "PLAYER", kind: "KNOCKOUT", message: "Vitória!" }],
      },
      { player: false, opponent: false },
    );

    expect(cue).toEqual({ player: "idle", opponent: "knockout", duration: 760 });
  });

  it("mostra o dano sobre o alvo e diferencia o dano bloqueado", () => {
    const turn = {
      playerAction: "QUICK_STRIKE" as const,
      opponentAction: "POWER_STRIKE" as const,
      events: [],
    };
    const directHit = {
      actor: "PLAYER" as const,
      kind: "HIT" as const,
      message: "Dano.",
      amount: 7,
    };
    const blockedHit = {
      actor: "OPPONENT" as const,
      kind: "HIT" as const,
      message: "Dano contra a guarda.",
      amount: 2,
    };

    expect(
      arenaCombatEffect(turn, directHit, {
        player: "attack",
        opponent: "hit",
        duration: 620,
      }),
    ).toMatchObject({ actor: "OPPONENT", kind: "damage", label: "−7", detail: "DANO" });
    expect(
      arenaCombatEffect(turn, blockedHit, {
        player: "block",
        opponent: "power-attack",
        duration: 620,
      }),
    ).toMatchObject({ actor: "PLAYER", kind: "blocked", label: "−2", detail: "BLOQUEADO" });
  });

  it("traduz guarda, erro, recuperação, movimento e nocaute em feedback visual", () => {
    const turn = {
      playerAction: "ADVANCE" as const,
      opponentAction: "GUARD" as const,
      events: [],
    };
    const cue = { player: "idle" as const, opponent: "idle" as const, duration: 520 };

    expect(
      arenaCombatEffect(
        turn,
        { actor: "PLAYER", kind: "MOVE", message: "Avançou.", amount: 2 },
        cue,
      ),
    ).toMatchObject({ actor: "PLAYER", kind: "move", label: "AVANÇA", detail: "2 CASAS" });
    expect(
      arenaCombatEffect(turn, { actor: "OPPONENT", kind: "GUARD", message: "Guarda." }, cue),
    ).toMatchObject({ actor: "OPPONENT", kind: "guard", label: "GUARDA" });
    expect(
      arenaCombatEffect(turn, { actor: "PLAYER", kind: "MISS", message: "Errou." }, cue),
    ).toMatchObject({ actor: "PLAYER", kind: "miss", label: "ERROU" });
    expect(
      arenaCombatEffect(turn, { actor: "PLAYER", kind: "RECOVER", message: "Fôlego." }, cue),
    ).toMatchObject({ actor: "PLAYER", kind: "recover", label: "FÔLEGO" });
    expect(
      arenaCombatEffect(turn, { actor: "PLAYER", kind: "KNOCKOUT", message: "Vitória." }, cue),
    ).toMatchObject({ actor: "OPPONENT", kind: "knockout", label: "NOCAUTE" });
  });
});
