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
    input: { model: string; messages: OllamaChatMessage[]; maxTokens?: number },
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

const errorResponseSchema = z.object({ error: z.string().trim().min(1) }).passthrough();

function ollamaRequestError(status: number, detail: string | null) {
  const normalized = detail?.toLocaleLowerCase("en-US") ?? "";
  if (status === 404)
    return new AppError(
      "O modelo configurado não está instalado no Ollama.",
      409,
      "OLLAMA_MODEL_NOT_FOUND",
    );
  if (status === 429)
    return new AppError(
      "O servidor de IA está ocupado. Tente novamente em instantes.",
      503,
      "OLLAMA_BUSY",
    );
  if (normalized.includes("memory") || normalized.includes("not enough"))
    return new AppError(
      "O modelo não cabe na memória disponível do servidor de IA. Escolha um modelo menor.",
      503,
      "OLLAMA_INSUFFICIENT_MEMORY",
    );
  if (
    normalized.includes("context") &&
    (normalized.includes("length") ||
      normalized.includes("window") ||
      normalized.includes("too long"))
  )
    return new AppError(
      "O contexto ultrapassou o limite do modelo. Reduza as fontes da comunidade ou use um modelo com contexto maior.",
      503,
      "OLLAMA_CONTEXT_LIMIT",
    );
  if (normalized.includes("does not support chat"))
    return new AppError(
      "O modelo escolhido não oferece conversa. Selecione um modelo compatível com chat.",
      409,
      "OLLAMA_CHAT_NOT_SUPPORTED",
    );
  if (status === 400)
    return new AppError(
      "O Ollama rejeitou os parâmetros da conversa. Verifique o modelo e atualize o servidor.",
      503,
      "OLLAMA_BAD_REQUEST",
    );
  return new AppError(
    status >= 500
      ? "O Ollama falhou ao executar o modelo. Consulte os logs do servidor de IA."
      : "O servidor de IA recusou a solicitação.",
    503,
    "OLLAMA_REQUEST_FAILED",
  );
}

async function responseJson(response: Response, path: string) {
  const rawBody = await response.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    const detail = parsedError.success ? parsedError.data.error.slice(0, 500) : null;
    console.error(
      JSON.stringify({
        level: "error",
        message: "Ollama request failed",
        path,
        status: response.status,
        detail,
      }),
    );
    throw ollamaRequestError(response.status, detail);
  }
  if (body === null) {
    throw new AppError(
      "O servidor de IA retornou uma resposta inválida.",
      502,
      "OLLAMA_INVALID_RESPONSE",
    );
  }
  return body;
}

export const ollamaClient: OllamaClient = {
  async listModels(config) {
    const response = await ollamaFetch(config, "/api/tags", { method: "GET" });
    const parsed = tagsResponseSchema.safeParse(await responseJson(response, "/api/tags"));
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
        keep_alive: "30m",
        options: { temperature: 0.25, num_predict: input.maxTokens ?? 500 },
      }),
    });
    const parsed = chatResponseSchema.safeParse(await responseJson(response, "/api/chat"));
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
