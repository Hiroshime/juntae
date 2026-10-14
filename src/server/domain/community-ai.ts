export const communityAiSources = [
  "EVENTS",
  "AVAILABILITY",
  "POLLS",
  "ANNOUNCEMENTS",
  "CHALLENGES",
] as const;

export type CommunityAiSource = (typeof communityAiSources)[number];

type CommunityAiSourceSettings = {
  includeEvents: boolean;
  includeAvailability: boolean;
  includePolls: boolean;
  includeAnnouncements: boolean;
  includeChallenges: boolean;
};

const sourceSettings: Record<CommunityAiSource, keyof CommunityAiSourceSettings> = {
  EVENTS: "includeEvents",
  AVAILABILITY: "includeAvailability",
  POLLS: "includePolls",
  ANNOUNCEMENTS: "includeAnnouncements",
  CHALLENGES: "includeChallenges",
};

const sourcePatterns: Record<CommunityAiSource, RegExp[]> = {
  EVENTS: [
    /\bevento(s)?\b/,
    /\bencontro(s)?\b/,
    /\bpasseio(s)?\b/,
    /\bpresenca(s)?\b/,
    /\bconfirmad[oa]s?\b/,
    /\bconfirmou\b/,
    /\brsvp(s)?\b/,
    /\bquem (ja )?(vai|ira|confirmou)\b/,
  ],
  AVAILABILITY: [
    /\bdisponibilidade(s)?\b/,
    /\bdisponive(is|l)\b/,
    /\blivre(s)?\b/,
    /\bfolga(s)?\b/,
    /\bescala(s)?\b/,
    /\bmelhor(es)? (dia|data|horario)/,
    /\bquando (podemos|da para|estamos)\b/,
  ],
  POLLS: [
    /\bvotac(?:ao|oes)\b/,
    /\benquete(s)?\b/,
    /\bvoto(s|u)?\b/,
    /\bvotar\b/,
    /\bopc(?:ao|oes)\b/,
  ],
  ANNOUNCEMENTS: [
    /\bcomunicado(s)?\b/,
    /\banuncio(s)?\b/,
    /\brecado(s)?\b/,
    /\bnovidade(s)?\b/,
    /\bpublicac(?:ao|oes)\b/,
    /\bpost(s)?\b/,
  ],
  CHALLENGES: [
    /\bdesafio(s)?\b/,
    /\btreino(s)?\b/,
    /\branking(s)?\b/,
    /\bpontuac(?:ao|oes)\b/,
    /\batividade(s)? fitness\b/,
  ],
};

function normalizeForRouting(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectCommunityAiSources(
  settings: CommunityAiSourceSettings,
  messages: string[],
): Set<CommunityAiSource> {
  const allowed = communityAiSources.filter((source) => settings[sourceSettings[source]]);
  const matches = (text: string) =>
    allowed.filter((source) => sourcePatterns[source].some((pattern) => pattern.test(text)));
  const currentMatches = matches(normalizeForRouting(messages.at(-1) ?? ""));
  if (currentMatches.length) return new Set(currentMatches);

  // Se a pergunta atual for uma continuação curta, reaproveita somente os últimos assuntos do
  // usuário. Uma pergunta nova reconhecida nunca herda fontes sem relação da conversa antiga.
  const previousMatches = matches(normalizeForRouting(messages.slice(-3, -1).join(" \n ")));

  // Perguntas genéricas recebem todas as fontes autorizadas; perguntas reconhecidas recebem
  // somente os dados relevantes, reduzindo latência e distrações para modelos locais pequenos.
  return new Set(previousMatches.length ? previousMatches : allowed);
}
