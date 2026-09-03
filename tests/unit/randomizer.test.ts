import { describe, expect, it } from "vitest";
import {
  generateRandomResult,
  RandomizerConfigurationError,
  type RandomIndex,
  type RandomizerEntry,
  type RandomizerResult,
} from "@/server/domain/randomizer";

const participants = (count: number): RandomizerEntry[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p-${index}`, label: `Pessoa ${index + 1}` }));

function deterministicRandom(): RandomIndex {
  let cursor = 0;
  return (upperExclusive) => (cursor++ * 7 + 3) % upperExclusive;
}

function grouped(result: RandomizerResult) {
  if (result.kind !== "GROUPS") throw new Error("Resultado não contém grupos.");
  return result;
}

describe("randomizer domain", () => {
  it("distribui cada pessoa uma única vez em times equilibrados", () => {
    const result = grouped(
      generateRandomResult(
        {
          presetType: "TEAMS",
          participants: participants(8),
          configuration: { groupCount: 3, maxGroupSize: 3 },
        },
        deterministicRandom(),
      ),
    );
    const ids = result.groups.flatMap((group) => group.members.map((member) => member.id));
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(result.groups.map((group) => group.members.length).sort()).toEqual([2, 3, 3]);
  });

  it("forma grupos de até N com diferença máxima de uma pessoa", () => {
    const result = grouped(
      generateRandomResult(
        {
          presetType: "GROUPS",
          participants: participants(10),
          configuration: { maxGroupSize: 4 },
        },
        deterministicRandom(),
      ),
    );
    expect(result.groups.map((group) => group.members.length)).toEqual([4, 3, 3]);
    expect(result.groups.every((group) => group.members.length > 0)).toBe(true);
  });

  it("respeita capacidades de carros e detecta vagas faltantes", () => {
    const drivers = [
      { id: "d-1", label: "João", capacity: 2 },
      { id: "d-2", label: "Maria", capacity: 3 },
    ];
    const result = grouped(
      generateRandomResult(
        {
          presetType: "CARS",
          participants: participants(5),
          configuration: { drivers },
        },
        deterministicRandom(),
      ),
    );
    expect(result.groups.map((group) => group.members.length)).toEqual([2, 3]);
    expect(() =>
      generateRandomResult({
        presetType: "CARS",
        participants: participants(6),
        configuration: { drivers },
      }),
    ).toThrowError(expect.objectContaining({ code: "INSUFFICIENT_CAPACITY" }));
  });

  it("atribui itens sem repetição", () => {
    const result = generateRandomResult(
      {
        presetType: "ASSIGN_ITEMS",
        participants: participants(4),
        configuration: {
          items: participants(4).map((item) => ({ ...item, id: `item-${item.id}` })),
        },
      },
      deterministicRandom(),
    );
    expect(result.kind).toBe("ASSIGNMENTS");
    if (result.kind !== "ASSIGNMENTS") return;
    expect(new Set(result.assignments.map((assignment) => assignment.item.id)).size).toBe(4);
  });

  it("escolhe exatamente N pessoas únicas e aceita um único participante", () => {
    const result = generateRandomResult(
      {
        presetType: "PICK_PEOPLE",
        participants: participants(5),
        configuration: { count: 3 },
      },
      deterministicRandom(),
    );
    expect(result.kind).toBe("SELECTION");
    if (result.kind !== "SELECTION") return;
    expect(result.selected).toHaveLength(3);
    expect(new Set(result.selected.map((entry) => entry.id)).size).toBe(3);
    expect(
      generateRandomResult({
        presetType: "PICK_PEOPLE",
        participants: participants(1),
        configuration: { count: 1 },
      }),
    ).toMatchObject({ kind: "SELECTION", selected: participants(1) });
  });

  it("seleciona itens sem exigir participantes", () => {
    const result = generateRandomResult(
      {
        presetType: "PICK_ITEM",
        participants: [],
        configuration: { items: participants(3), count: 2 },
      },
      deterministicRandom(),
    );
    expect(result).toMatchObject({ kind: "SELECTION" });
    if (result.kind === "SELECTION") expect(result.selected).toHaveLength(2);
  });

  it("gera uma ordem contendo todas as pessoas uma única vez", () => {
    const result = generateRandomResult(
      {
        presetType: "RANDOM_ORDER",
        participants: participants(7),
        configuration: {},
      },
      deterministicRandom(),
    );
    expect(result.kind).toBe("ORDER");
    if (result.kind !== "ORDER") return;
    expect(new Set(result.ordered.map((entry) => entry.id))).toEqual(
      new Set(participants(7).map((entry) => entry.id)),
    );
  });

  it("respeita regras de pessoas juntas, separadas e capitães", () => {
    const result = grouped(
      generateRandomResult(
        {
          presetType: "TEAMS",
          participants: participants(6),
          configuration: { groupCount: 3 },
          constraints: {
            together: [["p-0", "p-1"]],
            separate: [["p-2", "p-3"]],
            captainIds: ["p-4", "p-5"],
          },
        },
        deterministicRandom(),
      ),
    );
    const groupOf = (id: string) =>
      result.groups.findIndex((group) => group.members.some((member) => member.id === id));
    expect(groupOf("p-0")).toBe(groupOf("p-1"));
    expect(groupOf("p-2")).not.toBe(groupOf("p-3"));
    expect(groupOf("p-4")).not.toBe(groupOf("p-5"));
  });

  it("respeita posição fixa e exclusão de item", () => {
    const fixed = grouped(
      generateRandomResult(
        {
          presetType: "TEAMS",
          participants: participants(4),
          configuration: { groupCount: 2 },
          constraints: { fixedGroups: [{ participantId: "p-0", groupIndex: 1 }] },
        },
        deterministicRandom(),
      ),
    );
    expect(fixed.groups[1].members.some((member) => member.id === "p-0")).toBe(true);

    const assigned = generateRandomResult(
      {
        presetType: "ASSIGN_ITEMS",
        participants: participants(2),
        configuration: {
          items: [
            { id: "item-0", label: "Item 1" },
            { id: "item-1", label: "Item 2" },
          ],
        },
        constraints: {
          excludedAssignments: [{ participantId: "p-0", itemId: "item-0" }],
        },
      },
      deterministicRandom(),
    );
    expect(assigned.kind).toBe("ASSIGNMENTS");
    if (assigned.kind === "ASSIGNMENTS") {
      expect(
        assigned.assignments.find((assignment) => assignment.participant.id === "p-0")?.item.id,
      ).toBe("item-1");
    }
  });

  it("rejeita restrições matematicamente incompatíveis", () => {
    expect(() =>
      generateRandomResult(
        {
          presetType: "TEAMS",
          participants: participants(3),
          configuration: { groupCount: 2 },
          constraints: {
            separate: [
              ["p-0", "p-1"],
              ["p-0", "p-2"],
              ["p-1", "p-2"],
            ],
          },
        },
        deterministicRandom(),
      ),
    ).toThrowError(expect.objectContaining({ code: "IMPOSSIBLE_CONSTRAINTS" }));
  });

  it("trata nomes manuais duplicados como entradas distintas", () => {
    const result = generateRandomResult(
      {
        presetType: "RANDOM_ORDER",
        participants: [
          { id: "manual-0", label: "Ana" },
          { id: "manual-1", label: "Ana" },
        ],
        configuration: {},
      },
      deterministicRandom(),
    );
    expect(result.kind === "ORDER" && result.ordered.map((entry) => entry.label)).toEqual([
      "Ana",
      "Ana",
    ]);
  });

  it("trata totais ímpares em duplas como trio ou pessoa sem par", () => {
    const trio = grouped(
      generateRandomResult(
        {
          presetType: "PAIRS",
          participants: participants(5),
          configuration: { oddMode: "TRIO" },
        },
        deterministicRandom(),
      ),
    );
    expect(trio.groups.map((group) => group.members.length)).toEqual([3, 2]);
    const unpaired = grouped(
      generateRandomResult(
        {
          presetType: "PAIRS",
          participants: participants(5),
          configuration: { oddMode: "UNPAIRED" },
        },
        deterministicRandom(),
      ),
    );
    expect(unpaired.groups).toHaveLength(2);
    expect(unpaired.unassigned).toHaveLength(1);

    const single = grouped(
      generateRandomResult({
        presetType: "PAIRS",
        participants: participants(1),
        configuration: { oddMode: "UNPAIRED" },
      }),
    );
    expect(single.groups).toHaveLength(0);
    expect(single.unassigned).toEqual(participants(1));
  });

  it("rejeita listas vazias nos presets que exigem participantes", () => {
    expect(() =>
      generateRandomResult({
        presetType: "TEAMS",
        participants: [],
        configuration: { groupCount: 2 },
      }),
    ).toThrowError(RandomizerConfigurationError);
  });
});
