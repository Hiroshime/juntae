import type { RandomizerPresetType, RandomizerResult } from "@/lib/randomizer";

export const randomizerPresetLabels: Record<RandomizerPresetType, string> = {
  TEAMS: "Separar em times",
  GROUPS: "Criar grupos de N",
  CARS: "Distribuir entre carros",
  ASSIGN_ITEMS: "Distribuir itens",
  PICK_PEOPLE: "Escolher pessoas",
  PICK_ITEM: "Escolher item",
  RANDOM_ORDER: "Gerar uma ordem",
  PAIRS: "Formar duplas",
};

export const randomizerPresetDescriptions: Record<RandomizerPresetType, string> = {
  TEAMS: "Times equilibrados, com nomes e capitães opcionais.",
  GROUPS: "Grupos uniformes respeitando o tamanho máximo.",
  CARS: "Passageiros distribuídos sem exceder as vagas.",
  ASSIGN_ITEMS: "Uma tarefa, prato ou recurso diferente para cada pessoa.",
  PICK_PEOPLE: "Escolha uma ou várias pessoas sem repetição.",
  PICK_ITEM: "Escolha entre restaurantes, jogos, filmes ou qualquer lista.",
  RANDOM_ORDER: "Uma ordem justa para jogar, escolher ou apresentar.",
  PAIRS: "Duplas com tratamento explícito quando o total for ímpar.",
};

export function formatRandomizerResultText(
  title: string,
  presetType: RandomizerPresetType,
  result: RandomizerResult,
) {
  const lines = [`🎲 ${title || randomizerPresetLabels[presetType]}`, ""];
  if (result.kind === "GROUPS") {
    for (const group of result.groups) {
      lines.push(group.label);
      for (const member of group.members) {
        lines.push(`• ${member.label}${group.captainId === member.id ? " (capitão)" : ""}`);
      }
      lines.push("");
    }
    if (result.unassigned?.length) {
      lines.push("Sem par");
      result.unassigned.forEach((entry) => lines.push(`• ${entry.label}`));
      lines.push("");
    }
  } else if (result.kind === "ASSIGNMENTS") {
    result.assignments.forEach(({ participant, item }) =>
      lines.push(`${participant.label} → ${item.label}`),
    );
    lines.push("");
  } else if (result.kind === "ORDER") {
    result.ordered.forEach((entry, index) => lines.push(`${index + 1}. ${entry.label}`));
    lines.push("");
  } else {
    result.selected.forEach((entry) => lines.push(`⭐ ${entry.label}`));
    lines.push("");
  }
  lines.push("Gerado pelo Juntaê.");
  return lines.join("\n").trim();
}
