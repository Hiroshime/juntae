"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AiSettings = {
  enabled: boolean;
  model: string;
  assistantName: string;
  customInstructions: string | null;
  includeEvents: boolean;
  includeAvailability: boolean;
  includePolls: boolean;
  includeAnnouncements: boolean;
  includeChallenges: boolean;
  updatedAt: string | null;
};

type Model = {
  name: string;
  size: number | null;
  parameterSize: string | null;
  quantization: string | null;
};

async function errorMessage(response: Response, fallback: string) {
  return response
    .json()
    .then((body) => (typeof body?.error === "string" ? body.error : fallback))
    .catch(() => fallback);
}

function modelDetails(model: Model) {
  const size = model.size ? `${(model.size / 1024 ** 3).toFixed(1)} GB` : null;
  return [model.parameterSize, model.quantization, size].filter(Boolean).join(" · ");
}

export function CommunityAiSettingsForm({
  communityId,
  serviceConfigured,
  settings,
}: {
  communityId: string;
  serviceConfigured: boolean;
  settings: AiSettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const endpoint = `/api/communities/${communityId}/ai/settings`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const checked = (name: string) => form.get(name) === "on";
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: checked("enabled"),
          model: String(form.get("model") ?? ""),
          assistantName: String(form.get("assistantName") ?? ""),
          customInstructions: String(form.get("customInstructions") ?? ""),
          includeEvents: checked("includeEvents"),
          includeAvailability: checked("includeAvailability"),
          includePolls: checked("includePolls"),
          includeAnnouncements: checked("includeAnnouncements"),
          includeChallenges: checked("includeChallenges"),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Falha ao salvar."));
      setMessage({ kind: "success", text: "Configuração da IA salva para esta comunidade." });
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy("test");
    setMessage(null);
    try {
      const response = await fetch(`${endpoint}/test`, { method: "POST" });
      if (!response.ok)
        throw new Error(await errorMessage(response, "Não foi possível testar o Ollama."));
      const data = (await response.json()) as {
        models: Model[];
        selectedModelAvailable: boolean;
      };
      setModels(data.models);
      setMessage({
        kind: data.selectedModelAvailable ? "success" : "error",
        text: data.selectedModelAvailable
          ? `Ollama conectado. O modelo configurado está disponível entre ${data.models.length} modelo(s).`
          : `Ollama conectado, mas o modelo configurado não foi encontrado. Escolha um dos ${data.models.length} modelo(s) listados.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Não foi possível testar o Ollama.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card full-span community-ai-settings">
      <div className="card-header">
        <div>
          <div className="eyebrow">Inteligência artificial · Beta</div>
          <h2>Assistente contextual da comunidade</h2>
          <p className="muted">
            O Ollama pertence à instalação, mas esta comunidade decide se usa a IA, qual modelo e
            quais informações entram no contexto.
          </p>
        </div>
        <span
          className={`status-dot ${settings.enabled && serviceConfigured ? "active" : "inactive"}`}
        >
          {settings.enabled
            ? serviceConfigured
              ? "Habilitada"
              : "Aguardando servidor"
            : "Desativada"}
        </span>
      </div>

      {!serviceConfigured && (
        <div className="error" role="alert">
          Defina OLLAMA_BASE_URL no ambiente do Juntaê. A configuração pode ser preparada agora, mas
          os membros só conseguirão conversar após reiniciar o container com essa variável.
        </div>
      )}
      {message && (
        <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      )}

      <form className="form ai-settings-form" onSubmit={save}>
        <label className="check-row ai-enable-row">
          <input defaultChecked={settings.enabled} name="enabled" type="checkbox" />
          <span>
            <strong>Habilitar assistente para os membros</strong>
            <small>Conversas são privadas para cada usuário dentro desta comunidade.</small>
          </span>
        </label>

        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="ai-assistant-name">Nome do assistente</label>
            <input
              defaultValue={settings.assistantName}
              id="ai-assistant-name"
              maxLength={60}
              minLength={2}
              name="assistantName"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ai-model">Modelo instalado no Ollama</label>
            <input
              defaultValue={settings.model}
              id="ai-model"
              list="ai-model-list"
              maxLength={120}
              name="model"
              placeholder="qwen3:1.7b"
              required
            />
            <datalist id="ai-model-list">
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {modelDetails(model)}
                </option>
              ))}
            </datalist>
            <span className="field-help">
              O modelo precisa estar previamente baixado no Ollama.
            </span>
          </div>
        </div>

        <fieldset className="ai-context-options">
          <legend>Fontes permitidas no contexto</legend>
          <p className="muted small">
            A IA recebe somente resumos dessas áreas. Dados financeiros, e-mails, senhas,
            credenciais, fotos e conteúdo de outras comunidades nunca são enviados.
          </p>
          <div className="grid grid-2">
            {[
              ["includeEvents", "Eventos e confirmações", settings.includeEvents],
              [
                "includeAvailability",
                "Disponibilidade dos próximos 14 dias",
                settings.includeAvailability,
              ],
              ["includePolls", "Votações abertas", settings.includePolls],
              ["includeAnnouncements", "Comunicados recentes", settings.includeAnnouncements],
              ["includeChallenges", "Desafios ativos ou futuros", settings.includeChallenges],
            ].map(([name, label, checked]) => (
              <label className="check-row" key={String(name)}>
                <input defaultChecked={Boolean(checked)} name={String(name)} type="checkbox" />
                <span>{String(label)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="ai-custom-instructions">Jeito de responder (opcional)</label>
          <textarea
            defaultValue={settings.customInstructions ?? ""}
            id="ai-custom-instructions"
            maxLength={1000}
            name="customInstructions"
            placeholder="Ex.: seja descontraído, use respostas curtas e chame a comunidade de Turma."
            rows={4}
          />
          <span className="field-help">
            Preferências de estilo não substituem as regras de privacidade e segurança.
          </span>
        </div>

        <div className="actions">
          <button className="button" disabled={busy !== null} type="submit">
            {busy === "save" ? "Salvando…" : "Salvar configuração"}
          </button>
          <button
            className="button secondary"
            disabled={busy !== null || !serviceConfigured}
            onClick={testConnection}
            type="button"
          >
            {busy === "test" ? "Testando…" : "Testar e listar modelos"}
          </button>
        </div>
      </form>

      {models.length > 0 && (
        <div className="ai-models-found">
          <strong>Modelos disponíveis neste Ollama</strong>
          <div>
            {models.map((model) => (
              <span className="pill" key={model.name}>
                {model.name}
                {modelDetails(model) ? ` · ${modelDetails(model)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
