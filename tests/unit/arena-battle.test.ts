import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArenaAvatar } from "@/features/games/arena-avatar";
import { ArenaBattle } from "@/features/games/arena-battle";
import {
  ARENA_OPPONENTS,
  arenaActionUnavailableReason,
  arenaAccessibleCampaignOpponents,
  arenaAvailableActions,
  arenaCampaignOpponents,
  arenaCampaignProgress,
  arenaOpponent,
  arenaOpponentCampaignStep,
  arenaOpponentLeague,
  arenaPreviousLeagueOpponents,
  resolveArenaRound,
  type ArenaBattleState,
  type ArenaCombatantSnapshot,
} from "@/lib/games/arena-battle";
import {
  DEFAULT_ARENA_APPEARANCE,
  DEFAULT_ARENA_ATTRIBUTES,
  arenaDerivedStats,
} from "@/lib/games/arena";

const player: ArenaCombatantSnapshot = {
  name: "Lysandra",
  appearance: DEFAULT_ARENA_APPEARANCE,
  attributes: DEFAULT_ARENA_ATTRIBUTES,
  derived: arenaDerivedStats(DEFAULT_ARENA_ATTRIBUTES),
  style: "BALANCED",
  intro: "A aurora chegou.",
};

const opponent = ARENA_OPPONENTS[0];

function state(overrides: Partial<ArenaBattleState> = {}): ArenaBattleState {
  return {
    round: 1,
    playerHealth: player.derived.maxHealth,
    playerEnergy: player.derived.maxEnergy,
    playerPosition: 2,
    playerGuarded: false,
    opponentHealth: opponent.derived.maxHealth,
    opponentEnergy: opponent.derived.maxEnergy,
    opponentPosition: 8,
    opponentGuarded: false,
    ...overrides,
  };
}

describe("motor de combate da Arena", () => {
  it("define a sequência completa da campanha e identifica a chefe", () => {
    expect(ARENA_OPPONENTS).toHaveLength(4);
    expect(arenaOpponentCampaignStep("AURELIA_CAMPEA_SOLAR")).toBe(3);
    expect(arenaCampaignProgress(3, 0)).toMatchObject({
      step: 3,
      totalSteps: 4,
      completions: 0,
      league: 1,
      opponentName: "Aurélia, Campeã Solar",
      isBoss: true,
    });
  });

  it("gera ligas estáveis, variadas e progressivas depois da campanha inicial", () => {
    const secondLeague = arenaCampaignOpponents(1);
    const sameLeague = arenaCampaignOpponents(1);
    const thirdLeague = arenaCampaignOpponents(2);

    expect(secondLeague).toEqual(sameLeague);
    expect(secondLeague.map((entry) => entry.level)).toEqual([6, 7, 8, 9]);
    expect(secondLeague.map((entry) => entry.key)).toEqual([
      "CHALLENGER_C1_S0",
      "CHALLENGER_C1_S1",
      "CHALLENGER_C1_S2",
      "CHALLENGER_C1_S3",
    ]);
    expect(new Set(secondLeague.map((entry) => entry.name))).toHaveLength(4);
    expect(thirdLeague.map((entry) => entry.name)).not.toEqual(
      secondLeague.map((entry) => entry.name),
    );
    expect(secondLeague.every((entry) => entry.procedural && entry.equipment?.length === 4)).toBe(
      true,
    );
    expect(arenaOpponent("CHALLENGER_C1_S2")).toEqual(secondLeague[2]);
    expect(arenaOpponentCampaignStep("CHALLENGER_C2_S0", 1)).toBeNull();
  });

  it("libera somente a liga imediatamente anterior para revanche", () => {
    expect(arenaPreviousLeagueOpponents(0)).toEqual([]);
    expect(arenaPreviousLeagueOpponents(1)).toEqual(ARENA_OPPONENTS);
    expect(arenaAccessibleCampaignOpponents(2).map((entry) => entry.key)).toEqual([
      "CHALLENGER_C2_S0",
      "CHALLENGER_C2_S1",
      "CHALLENGER_C2_S2",
      "CHALLENGER_C2_S3",
      "CHALLENGER_C1_S0",
      "CHALLENGER_C1_S1",
      "CHALLENGER_C1_S2",
      "CHALLENGER_C1_S3",
    ]);
    expect(arenaCampaignProgress(0, 2).previousLeague).toMatchObject({
      league: 2,
      opponents: arenaCampaignOpponents(1),
    });
  });

  it("identifica a liga real de cada adversário", () => {
    expect(arenaOpponentLeague("CAIO_DO_PATIO")).toBe(1);
    expect(arenaOpponentLeague("CHALLENGER_C4_S3")).toBe(5);
    expect(arenaOpponentLeague("CHALLENGER_C5_S0")).toBe(6);
    expect(arenaOpponentLeague("INVALIDO")).toBeNull();
  });

  it("apresenta a liga atual separada da revanche anterior", () => {
    const campaign = arenaCampaignProgress(0, 1);
    const markup = renderToStaticMarkup(
      createElement(ArenaBattle, {
        battle: null,
        campaignStep: campaign.step,
        communityId: "00000000-0000-4000-8000-000000000001",
        league: campaign.league,
        opponents: campaign.opponents,
        previousLeague: campaign.previousLeague,
        onBack: () => undefined,
        onBattleChange: () => undefined,
        onFinished: () => undefined,
      }),
    );

    expect(markup).toContain("Liga 2");
    expect(markup).toContain("Revanche · Liga 1");
    expect(markup).toContain("Todos liberados");
    expect(markup).toContain("Caio do Pátio");
  });

  it("limita rivais de ligas superiores ao nível 60 e atributos 20", () => {
    const highLeague = arenaCampaignOpponents(100);
    expect(highLeague.every((entry) => entry.level === 60)).toBe(true);
    expect(
      highLeague.every((entry) => Object.values(entry.attributes).every((value) => value <= 20)),
    ).toBe(true);
  });

  it("move os dois combatentes sem permitir cruzamento", () => {
    const result = resolveArenaRound(state(), player, opponent, "ADVANCE", () => 0);
    expect(result.state).toMatchObject({ playerPosition: 4, opponentPosition: 6 });
    expect(result.state.playerPosition).toBeLessThan(result.state.opponentPosition);
    expect(result.events.map((event) => event.kind)).toEqual(["MOVE", "MOVE"]);
  });

  it("bloqueia ataques fora de alcance e ações sem energia", () => {
    const initial = state({ playerEnergy: 3 });
    expect(arenaActionUnavailableReason(initial, "PLAYER", "QUICK_STRIKE")).toBe(
      "Energia insuficiente.",
    );
    expect(arenaActionUnavailableReason(state(), "PLAYER", "POWER_STRIKE")).toBe(
      "Adversário fora de alcance.",
    );
    expect(arenaAvailableActions(initial, "PLAYER")).not.toContain("QUICK_STRIKE");
    expect(() => resolveArenaRound(initial, player, opponent, "QUICK_STRIKE", () => 0)).toThrow(
      "Energia insuficiente.",
    );
  });

  it("reduz o dano quando a guarda é firmada antes do golpe", () => {
    const close = state({ opponentPosition: 3 });
    const guarded = resolveArenaRound(close, player, opponent, "GUARD", () => 0);
    const exposed = resolveArenaRound(close, player, opponent, "RECOVER", () => 0);
    expect(guarded.opponentAction).toBe("POWER_STRIKE");
    expect(guarded.state.playerHealth).toBeGreaterThan(exposed.state.playerHealth);
    expect(guarded.events.some((event) => event.message.includes("contra a guarda"))).toBe(true);
  });

  it("consome energia, empurra com golpe pesado e encerra por nocaute", () => {
    const heavy = resolveArenaRound(
      state({ opponentPosition: 3, opponentHealth: 30 }),
      player,
      opponent,
      "POWER_STRIKE",
      () => 0,
    );
    expect(heavy.state.playerEnergy).toBe(player.derived.maxEnergy - 10);
    expect(heavy.state.opponentPosition).toBe(4);

    const knockout = resolveArenaRound(
      state({ opponentPosition: 3, opponentHealth: 1 }),
      player,
      opponent,
      "QUICK_STRIKE",
      () => 0,
    );
    expect(knockout.outcome).toBe("WON");
    expect(knockout.state.opponentHealth).toBe(0);
    expect(knockout.events.at(-1)?.kind).toBe("KNOCKOUT");
  });

  it("usa agilidade e alterna empates para definir iniciativa", () => {
    const tiedAttributes = { ...DEFAULT_ARENA_ATTRIBUTES, agility: 2 };
    const tiedPlayer = {
      ...player,
      attributes: tiedAttributes,
      derived: arenaDerivedStats(tiedAttributes),
    };
    expect(
      resolveArenaRound(
        state({ opponentPosition: 3, round: 1 }),
        tiedPlayer,
        opponent,
        "GUARD",
        () => 0,
      ).actingFirst,
    ).toBe("PLAYER");
    expect(
      resolveArenaRound(
        state({ opponentPosition: 3, round: 2 }),
        tiedPlayer,
        opponent,
        "GUARD",
        () => 0,
      ).actingFirst,
    ).toBe("OPPONENT");
  });
});

describe("avatar da Arena", () => {
  it("mantém cabelo e barba alinhados à cabeça", () => {
    const markup = renderToStaticMarkup(
      createElement(ArenaAvatar, {
        appearance: { ...DEFAULT_ARENA_APPEARANCE, hairStyle: "LONG", beardStyle: "BRAIDED" },
        name: "Lysandra",
      }),
    );
    expect(markup).toContain('class="arena-avatar-hair" transform="translate(55 -12)"');
    expect(markup).toContain('transform="translate(125 0) scale(1.5 1) translate(-125 0)"');
    expect(markup).toContain('class="arena-avatar-beard" transform="translate(55 24)"');
  });

  it("desenha somente os equipamentos informados nas camadas do avatar", () => {
    const markup = renderToStaticMarkup(
      createElement(ArenaAvatar, {
        appearance: DEFAULT_ARENA_APPEARANCE,
        equipment: ["IRON_MAUL", "BRONZE_CUIRASS", "IRON_HELMET", "TOWER_SHIELD"],
        name: "Borin",
      }),
    );
    expect(markup).toContain('class="arena-equipment arena-equipment-weapon"');
    expect(markup).toContain('data-item-key="IRON_MAUL"');
    expect(markup).toContain('class="arena-equipment arena-equipment-armour"');
    expect(markup).toContain('data-item-key="BRONZE_CUIRASS"');
    expect(markup).toContain('class="arena-equipment arena-equipment-helmet"');
    expect(markup).toContain('data-item-key="IRON_HELMET"');
    expect(markup).toContain('class="arena-equipment arena-equipment-shield"');
    expect(markup).toContain('data-item-key="TOWER_SHIELD"');
    expect(markup).not.toContain('data-item-key="COPPER_SHORT_SWORD"');
    expect(markup).toContain("Malho dos Montes");
  });

  it("reutiliza a silhueta visual e preserva a identidade de um item avançado", () => {
    const markup = renderToStaticMarkup(
      createElement(ArenaAvatar, {
        appearance: DEFAULT_ARENA_APPEARANCE,
        equipment: ["ETERNAL_WEAPON"],
        name: "Lenda",
      }),
    );
    expect(markup).toContain('data-item-key="ETERNAL_WEAPON"');
    expect(markup).toContain("Lâmina da Eternidade");
    expect(markup).toContain("#7b3362");
  });
});
