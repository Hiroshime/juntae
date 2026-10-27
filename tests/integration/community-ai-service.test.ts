import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createPollSchema } from "@/lib/validation/poll";
import { createPoll } from "@/server/services/poll-service";
import type { CommunityAiSettingsInput } from "@/lib/validation/community-ai";
import type { OllamaClient, OllamaChatMessage } from "@/server/ollama";
import {
  deleteAiConversation,
  getAiConversation,
  getCommunityAiWorkspace,
  saveCommunityAiSettings,
  sendCommunityAiMessage,
  testCommunityAiConnection,
} from "@/server/services/community-ai-service";

describe("assistente contextual privado", () => {
  const suffix = randomUUID();
  let ownerId = "";
  let adminId = "";
  let memberId = "";
  let secondMemberId = "";
  let outsiderId = "";
  let communityId = "";
  let outsiderCommunityId = "";
  const captured: OllamaChatMessage[][] = [];
  const fakeClient: OllamaClient = {
    async listModels() {
      return [{ name: "qwen3:1.7b", size: 123, parameterSize: "1.7B", quantization: "Q4_K_M" }];
    },
    async chat(_config, input) {
      captured.push(input.messages);
      return {
        content: "A melhor opção é sábado.",
        model: input.model,
        promptTokens: 100,
        completionTokens: 20,
        durationMs: 250,
      };
    },
  };
  const settings: CommunityAiSettingsInput = {
    enabled: true,
    model: "qwen3:1.7b",
    assistantName: "Juntinha",
    customInstructions: "Seja breve.",
    includeEvents: true,
    includeAvailability: true,
    includePolls: true,
    includeAnnouncements: true,
    includeChallenges: false,
  };

  beforeAll(async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.test:11434");
    vi.stubEnv("OLLAMA_REQUEST_TIMEOUT_MS", "90000");
    const users = await Promise.all(
      ["owner", "admin", "member", "second", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `ai-${name}-${suffix}@test.local`,
            passwordHash: "unused-test-hash",
            timezone: "America/Sao_Paulo",
          },
        }),
      ),
    );
    [ownerId, adminId, memberId, secondMemberId, outsiderId] = users.map((user) => user.id);
    const community = await prisma.community.create({
      data: {
        name: "Turma IA",
        slug: `turma-ai-${suffix}`,
        createdById: ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" },
            { userId: adminId, role: "ADMIN" },
            { userId: memberId, role: "MEMBER", displayName: "Pessoa principal" },
            { userId: secondMemberId, role: "MEMBER", displayName: "Amiga livre" },
          ],
        },
      },
    });
    communityId = community.id;
    outsiderCommunityId = (
      await prisma.community.create({
        data: {
          name: "Outra comunidade",
          slug: `outra-ai-${suffix}`,
          createdById: outsiderId,
          members: { create: { userId: outsiderId, role: "OWNER" } },
        },
      })
    ).id;
    await Promise.all([
      prisma.event.create({
        data: {
          communityId,
          createdById: ownerId,
          title: "Churrasco da turma",
          startsAt: new Date("2026-10-18T15:00:00Z"),
          rsvps: { create: { userId: secondMemberId, status: "GOING" } },
        },
      }),
      prisma.event.create({
        data: {
          communityId: outsiderCommunityId,
          createdById: outsiderId,
          title: "SEGREDO DE OUTRA COMUNIDADE",
          startsAt: new Date("2026-10-18T15:00:00Z"),
        },
      }),
      prisma.poll.create({
        data: {
          communityId,
          createdById: ownerId,
          title: "Qual passeio?",
          type: "SINGLE_CHOICE",
          options: {
            create: [
              { label: "Parque", sortOrder: 0 },
              { label: "Cinema", sortOrder: 1 },
            ],
          },
        },
      }),
      prisma.socialPost.create({
        data: {
          communityId,
          authorId: adminId,
          kind: "ANNOUNCEMENT",
          content: "Levem protetor solar.",
        },
      }),
      prisma.availabilityOverride.create({
        data: {
          communityId,
          userId: secondMemberId,
          startAt: new Date("2026-10-17T03:00:00Z"),
          endAt: new Date("2026-10-18T03:00:00Z"),
          allDay: true,
          status: "AVAILABLE",
        },
      }),
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (communityId) await prisma.community.deleteMany({ where: { id: communityId } });
    if (outsiderCommunityId)
      await prisma.community.deleteMany({ where: { id: outsiderCommunityId } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [ownerId, adminId, memberId, secondMemberId, outsiderId].filter(Boolean) },
      },
    });
  });

  it("permite configuração por owner/admin e bloqueia membro", async () => {
    await expect(saveCommunityAiSettings(ownerId, communityId, settings)).resolves.toMatchObject({
      enabled: true,
      assistantName: "Juntinha",
    });
    await expect(
      saveCommunityAiSettings(adminId, communityId, { ...settings, assistantName: "Juntaê IA" }),
    ).resolves.toMatchObject({ assistantName: "Juntaê IA" });
    await expect(saveCommunityAiSettings(memberId, communityId, settings)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      testCommunityAiConnection(adminId, communityId, fakeClient),
    ).resolves.toMatchObject({
      selectedModelAvailable: true,
      inferenceSucceeded: true,
      models: [{ name: "qwen3:1.7b" }],
    });
    expect(captured.at(-1)?.at(-1)).toEqual({
      role: "user",
      content: "Responda somente com OK.",
    });
  });

  it("monta somente o contexto permitido e persiste a conversa privada", async () => {
    const result = await sendCommunityAiMessage(
      memberId,
      communityId,
      { message: "Faça um panorama completo da comunidade." },
      fakeClient,
      new Date("2026-10-14T15:00:00Z"),
    );
    expect(result.messages).toHaveLength(2);
    const system = captured.at(-1)?.[0].content ?? "";
    expect(system).toContain("Churrasco da turma");
    expect(system).toContain("Qual passeio?");
    expect(system).toContain("Levem protetor solar.");
    expect(system).toContain("Amiga livre");
    expect(system).not.toContain("SEGREDO DE OUTRA COMUNIDADE");
    expect(system).not.toContain(`ai-member-${suffix}@test.local`);

    await expect(
      getAiConversation(memberId, communityId, result.conversation.id),
    ).resolves.toMatchObject({ messages: [{ role: "USER" }, { role: "ASSISTANT" }] });
    await expect(
      getAiConversation(secondMemberId, communityId, result.conversation.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getAiConversation(outsiderId, communityId, result.conversation.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(getCommunityAiWorkspace(memberId, communityId)).resolves.toMatchObject({
      canManage: false,
      assistant: { enabled: true },
      conversations: [{ id: result.conversation.id, messageCount: 2 }],
    });
    await expect(
      deleteAiConversation(secondMemberId, communityId, result.conversation.id),
    ).rejects.toMatchObject({ status: 404 });
    await deleteAiConversation(memberId, communityId, result.conversation.id);
    expect(
      await prisma.aiConversation.findUnique({ where: { id: result.conversation.id } }),
    ).toBeNull();
  });

  it("envia só eventos e agrupa corretamente quem vai ou não respondeu", async () => {
    const result = await sendCommunityAiMessage(
      secondMemberId,
      communityId,
      { message: "Quais são os próximos eventos e quem vai?" },
      fakeClient,
      new Date("2026-10-14T15:00:00Z"),
    );
    const system = captured.at(-1)?.[0].content ?? "";
    expect(system).toContain('"includedSources":["EVENTS"]');
    expect(system).toContain("Churrasco da turma");
    expect(system).toContain('"going":[{"member":"Amiga livre"');
    expect(system).toContain('"noResponse"');
    expect(system).toContain("Pessoa principal");
    expect(system).not.toContain("Qual passeio?");
    expect(system).not.toContain("Levem protetor solar.");
    expect(system).not.toContain("availabilityNext14Days");
    await deleteAiConversation(secondMemberId, communityId, result.conversation.id);
  });

  it("respeita fontes desabilitadas e não persiste quando o Ollama falha", async () => {
    await saveCommunityAiSettings(ownerId, communityId, {
      ...settings,
      includeEvents: false,
      includeAvailability: false,
      includePolls: true,
      includeAnnouncements: false,
    });
    await sendCommunityAiMessage(
      memberId,
      communityId,
      { message: "O que temos em aberto?" },
      fakeClient,
      new Date("2026-10-14T15:00:00Z"),
    );
    const system = captured.at(-1)?.[0].content ?? "";
    expect(system).not.toContain("Churrasco da turma");
    expect(system).not.toContain("Levem protetor solar.");
    expect(system).toContain("Qual passeio?");

    const before = await prisma.aiMessage.count({
      where: { conversation: { communityId } },
    });
    const failingClient: OllamaClient = {
      ...fakeClient,
      async chat() {
        throw new Error("offline");
      },
    };
    await expect(
      sendCommunityAiMessage(
        secondMemberId,
        communityId,
        { message: "Teste de falha" },
        failingClient,
        new Date("2026-10-14T15:00:00Z"),
      ),
    ).rejects.toThrow("offline");
    expect(await prisma.aiMessage.count({ where: { conversation: { communityId } } })).toBe(before);
  });

  it("serializa perguntas simultâneas sem inverter ou sobrescrever mensagens", async () => {
    const initial = await sendCommunityAiMessage(
      secondMemberId,
      communityId,
      { message: "Abra uma conversa para o teste concorrente." },
      fakeClient,
      new Date("2026-10-14T15:00:00Z"),
    );
    await Promise.all([
      sendCommunityAiMessage(
        secondMemberId,
        communityId,
        { conversationId: initial.conversation.id, message: "Pergunta simultânea A" },
        fakeClient,
      ),
      sendCommunityAiMessage(
        secondMemberId,
        communityId,
        { conversationId: initial.conversation.id, message: "Pergunta simultânea B" },
        fakeClient,
      ),
    ]);

    const conversation = await getAiConversation(
      secondMemberId,
      communityId,
      initial.conversation.id,
    );
    expect(conversation.messages).toHaveLength(6);
    expect(conversation.messages.map((message) => message.role)).toEqual([
      "USER",
      "ASSISTANT",
      "USER",
      "ASSISTANT",
      "USER",
      "ASSISTANT",
    ]);
  });

  it("identifica a pergunta de cada alternativa no contexto das votações agrupadas", async () => {
    const event = await prisma.event.findFirstOrThrow({
      where: { communityId, title: "Churrasco da turma" },
    });
    const poll = await createPoll(
      ownerId,
      communityId,
      createPollSchema.parse({
        title: "Refeições da turma",
        eventId: event.id,
        type: "GROUPED",
        description: "",
        closesAt: null,
        questions: [
          { title: "Almoço", type: "SINGLE_CHOICE", options: ["Arroz", "Macarrão"] },
          { title: "Jantar", type: "MULTIPLE_CHOICE", options: ["Pizza", "Sanduíche"] },
        ],
      }),
    );
    try {
      await saveCommunityAiSettings(ownerId, communityId, settings);
      const result = await sendCommunityAiMessage(
        memberId,
        communityId,
        { message: "Quais votações estão abertas?" },
        fakeClient,
      );
      const context = captured.at(-1)?.[0].content ?? "";
      expect(context).toContain('"question":"Almoço"');
      expect(context).toContain('"event":"Churrasco da turma"');
      expect(context).toContain('"question":"Jantar"');
      expect(context).toContain('"selectionType":"MULTIPLE_CHOICE"');
      await deleteAiConversation(memberId, communityId, result.conversation.id);
    } finally {
      await prisma.poll.delete({ where: { id: poll.id } });
    }
  });

  it("aplica os limites de conversas e mensagens no servidor", async () => {
    await prisma.aiConversation.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        communityId,
        userId: adminId,
        title: `Conversa limitada ${index + 1}`,
      })),
    });
    await expect(
      sendCommunityAiMessage(
        adminId,
        communityId,
        { message: "Não deve criar a conversa vinte e um." },
        fakeClient,
      ),
    ).rejects.toMatchObject({ status: 409, code: "AI_CONVERSATION_LIMIT" });

    const fullConversation = await prisma.aiConversation.create({
      data: { communityId, userId: ownerId, title: "Conversa completa" },
    });
    await prisma.aiMessage.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        conversationId: fullConversation.id,
        sequence: index + 1,
        role: index % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
        content: `Mensagem ${index + 1}`,
      })),
    });
    await expect(
      sendCommunityAiMessage(
        ownerId,
        communityId,
        { conversationId: fullConversation.id, message: "Não deve ultrapassar o limite." },
        fakeClient,
      ),
    ).rejects.toMatchObject({ status: 409, code: "AI_MESSAGE_LIMIT" });
  });
});
