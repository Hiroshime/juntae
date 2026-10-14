import { z } from "zod";
import type { OllamaConfig } from "@/lib/env";
import { AppError } from "@/server/errors";

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaChatResult = {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
};

export type OllamaModel = {
  name: string;
  size: number | null;
  parameterSize: string | null;
  quantization: string | null;
};

export type OllamaClient = {
  listModels(config: OllamaConfig): Promise<OllamaModel[]>;
  chat(
    config: OllamaConfig,
    input: { model: string; messages: OllamaChatMessage[] },
  ): Promise<OllamaChatResult>;
};

const tagsResponseSchema = z.object({
  models: z.array(
    z.object({
      name: z.string().min(1),
      size: z.number().nonnegative().optional(),
      details: z
        .object({
          parameter_size: z.string().optional(),
          quantization_level: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

const chatResponseSchema = z.object({
  model: z.string().min(1),
  message: z.object({ role: z.literal("assistant"), content: z.string() }),
  done: z.boolean(),
  total_duration: z.number().nonnegative().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

async function ollamaFetch(config: OllamaConfig, path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError(
        "O servidor de IA demorou para responder. Tente novamente em instantes.",
        504,
        "OLLAMA_TIMEOUT",
      );
    }
    throw new AppError("Não foi possível conectar ao servidor de IA.", 503, "OLLAMA_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

async function responseJson(response: Response) {
  if (!response.ok) {
    throw new AppError(
      response.status === 404
        ? "O modelo configurado não está instalado no Ollama."
        : "O servidor de IA recusou a solicitação.",
      response.status === 404 ? 409 : 503,
      response.status === 404 ? "OLLAMA_MODEL_NOT_FOUND" : "OLLAMA_REQUEST_FAILED",
    );
  }
  return response.json().catch(() => {
    throw new AppError(
      "O servidor de IA retornou uma resposta inválida.",
      502,
      "OLLAMA_INVALID_RESPONSE",
    );
  });
}

export const ollamaClient: OllamaClient = {
  async listModels(config) {
    const response = await ollamaFetch(config, "/api/tags", { method: "GET" });
    const parsed = tagsResponseSchema.safeParse(await responseJson(response));
    if (!parsed.success)
      throw new AppError(
        "O servidor de IA retornou uma lista de modelos inválida.",
        502,
        "OLLAMA_INVALID_RESPONSE",
      );
    return parsed.data.models.map((model) => ({
      name: model.name,
      size: model.size ?? null,
      parameterSize: model.details?.parameter_size ?? null,
      quantization: model.details?.quantization_level ?? null,
    }));
  },

  async chat(config, input) {
    const response = await ollamaFetch(config, "/api/chat", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
        think: false,
        keep_alive: "5m",
        options: { temperature: 0.25, num_predict: 700 },
      }),
    });
    const parsed = chatResponseSchema.safeParse(await responseJson(response));
    if (!parsed.success || !parsed.data.done || !parsed.data.message.content.trim())
      throw new AppError(
        "O servidor de IA não concluiu uma resposta válida.",
        502,
        "OLLAMA_INVALID_RESPONSE",
      );
    const rawContent = parsed.data.message.content.trim();
    const content =
      rawContent.length > 12_000
        ? `${rawContent.slice(0, 11_980).trimEnd()}\n\n[Resposta encurtada pelo Juntaê]`
        : rawContent;
    return {
      content,
      model: parsed.data.model,
      promptTokens: parsed.data.prompt_eval_count ?? null,
      completionTokens: parsed.data.eval_count ?? null,
      durationMs:
        parsed.data.total_duration == null
          ? null
          : Math.round(parsed.data.total_duration / 1_000_000),
    };
  },
};
