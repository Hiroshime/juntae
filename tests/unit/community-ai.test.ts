import { afterEach, describe, expect, it, vi } from "vitest";
import { getOllamaConfig } from "@/lib/env";
import { communityAiMessageSchema, communityAiSettingsSchema } from "@/lib/validation/community-ai";
import { ollamaClient } from "@/server/ollama";

function baseEnvironment() {
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("AUTH_SECRET", "test-secret-with-at-least-32-characters");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("OLLAMA_REQUEST_TIMEOUT_MS", "90000");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("IA contextual", () => {
  it("valida configuração, modelo e pelo menos uma fonte quando habilitada", () => {
    const valid = communityAiSettingsSchema.parse({
      enabled: true,
      model: "qwen3:1.7b",
      assistantName: "Amiga da turma",
      customInstructions: " Responda de forma curta. ",
      includeEvents: true,
      includeAvailability: false,
      includePolls: false,
      includeAnnouncements: false,
      includeChallenges: false,
    });
    expect(valid.customInstructions).toBe("Responda de forma curta.");
    expect(
      communityAiSettingsSchema.safeParse({
        ...valid,
        model: "modelo com espaço",
      }).success,
    ).toBe(false);
    expect(
      communityAiSettingsSchema.safeParse({
        ...valid,
        includeEvents: false,
      }).success,
    ).toBe(false);
    expect(communityAiMessageSchema.safeParse({ message: "x" }).success).toBe(false);
    expect(communityAiMessageSchema.safeParse({ message: "Qual o próximo evento?" }).success).toBe(
      true,
    );
  });

  it("mantém Ollama opcional e valida URL/timeout", () => {
    baseEnvironment();
    vi.stubEnv("OLLAMA_BASE_URL", "");
    expect(getOllamaConfig()).toBeNull();

    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama:11434/");
    expect(getOllamaConfig()).toEqual({ baseUrl: "http://ollama:11434", timeoutMs: 90_000 });

    vi.stubEnv("OLLAMA_BASE_URL", "ftp://ollama.local");
    expect(() => getOllamaConfig()).toThrow(/OLLAMA_BASE_URL/);
  });

  it("usa os endpoints oficiais sem streaming e limita a resposta persistida", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              {
                name: "qwen3:1.7b",
                size: 1_400_000_000,
                details: { parameter_size: "1.7B", quantization_level: "Q4_K_M" },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "qwen3:1.7b",
            message: { role: "assistant", content: "Resposta útil" },
            done: true,
            total_duration: 2_500_000,
            prompt_eval_count: 42,
            eval_count: 12,
          }),
          { status: 200 },
        ),
      );
    const config = { baseUrl: "http://ollama:11434", timeoutMs: 5_000 };
    await expect(ollamaClient.listModels(config)).resolves.toEqual([
      {
        name: "qwen3:1.7b",
        size: 1_400_000_000,
        parameterSize: "1.7B",
        quantization: "Q4_K_M",
      },
    ]);
    await expect(
      ollamaClient.chat(config, {
        model: "qwen3:1.7b",
        messages: [{ role: "user", content: "Oi" }],
      }),
    ).resolves.toEqual({
      content: "Resposta útil",
      model: "qwen3:1.7b",
      promptTokens: 42,
      completionTokens: 12,
      durationMs: 3,
    });
    const chatRequest = fetchMock.mock.calls[1];
    expect(chatRequest[0]).toBe("http://ollama:11434/api/chat");
    expect(JSON.parse(String((chatRequest[1] as RequestInit).body))).toMatchObject({
      model: "qwen3:1.7b",
      stream: false,
      think: false,
      keep_alive: "30m",
      options: { temperature: 0.25, num_predict: 500 },
    });
  });

  it("traduz erros do Ollama sem expor a resposta bruta ao usuário", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "model requires more system memory" }), {
        status: 500,
      }),
    );

    await expect(
      ollamaClient.chat(
        { baseUrl: "http://ollama:11434", timeoutMs: 5_000 },
        {
          model: "qwen3:4b-instruct",
          messages: [{ role: "user", content: "Oi" }],
          maxTokens: 16,
        },
      ),
    ).rejects.toMatchObject({
      code: "OLLAMA_INSUFFICIENT_MEMORY",
      message: expect.stringContaining("não cabe na memória"),
    });
  });
});
