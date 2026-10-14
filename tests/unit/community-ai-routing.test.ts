import { describe, expect, it } from "vitest";
import { selectCommunityAiSources } from "@/server/domain/community-ai";

const allSources = {
  includeEvents: true,
  includeAvailability: true,
  includePolls: true,
  includeAnnouncements: true,
  includeChallenges: true,
};

describe("seleção de contexto da IA", () => {
  it("seleciona somente eventos para perguntas sobre próximos eventos e presença", () => {
    expect([
      ...selectCommunityAiSources(allSources, ["Quais são os próximos eventos e quem vai?"]),
    ]).toEqual(["EVENTS"]);
  });

  it("combina fontes quando a pergunta depende de agenda e eventos", () => {
    expect([
      ...selectCommunityAiSources(allSources, [
        "Quais são os melhores dias livres para marcarmos um evento?",
      ]),
    ]).toEqual(["EVENTS", "AVAILABILITY"]);
  });

  it("usa o assunto recente em continuações e respeita fontes desabilitadas", () => {
    expect([
      ...selectCommunityAiSources({ ...allSources, includeEvents: false }, [
        "Quais votações estão abertas?",
        "E quais ainda precisam de resposta?",
      ]),
    ]).toEqual(["POLLS"]);
  });

  it("usa todas as fontes autorizadas somente em perguntas genéricas", () => {
    expect([
      ...selectCommunityAiSources({ ...allSources, includeChallenges: false }, [
        "Faça um panorama da comunidade.",
      ]),
    ]).toEqual(["EVENTS", "AVAILABILITY", "POLLS", "ANNOUNCEMENTS"]);
  });
});
