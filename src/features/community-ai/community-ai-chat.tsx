"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { RichText } from "@/components/rich-text";

type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type Message = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
};

async function responseError(response: Response, fallback: string) {
  return response
    .json()
    .then((body) => (typeof body?.error === "string" ? body.error : fallback))
    .catch(() => fallback);
}

export function CommunityAiChat({
  assistantName,
  communityId,
  conversations: initialConversations,
  model,
}: {
  assistantName: string;
  communityId: string;
  conversations: ConversationSummary[];
  model: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "send" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesEndpoint = `/api/communities/${communityId}/ai/messages`;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pendingMessage]);

  function newConversation() {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
    setDraft("");
    setError(null);
  }

  async function openConversation(id: string) {
    if (busy === "send") return;
    setBusy("load");
    setError(null);
    try {
      const response = await fetch(`/api/communities/${communityId}/ai/conversations/${id}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Não foi possível abrir a conversa."));
      const data = (await response.json()) as { messages: Message[] };
      setActiveId(id);
      setMessages(data.messages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir a conversa.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Excluir esta conversa privada? Esta ação não pode ser desfeita.")) return;
    setBusy("delete");
    setError(null);
    try {
      const response = await fetch(`/api/communities/${communityId}/ai/conversations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Não foi possível excluir a conversa."));
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        setDraft("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir a conversa.");
    } finally {
      setBusy(null);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (message.length < 2 || busy) return;
    setBusy("send");
    setError(null);
    setPendingMessage(message);
    setDraft("");
    try {
      const response = await fetch(messagesEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, message }),
      });
      if (!response.ok)
        throw new Error(await responseError(response, "A IA não conseguiu responder."));
      const data = (await response.json()) as {
        conversation: { id: string; title: string };
        messages: Message[];
      };
      setMessages((current) => [...current, ...data.messages]);
      setActiveId(data.conversation.id);
      setConversations((current) => {
        const existing = current.find((item) => item.id === data.conversation.id);
        const summary: ConversationSummary = {
          id: data.conversation.id,
          title: data.conversation.title,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: (existing?.messageCount ?? 0) + 2,
        };
        return [summary, ...current.filter((item) => item.id !== summary.id)];
      });
    } catch (caught) {
      setDraft(message);
      setError(caught instanceof Error ? caught.message : "A IA não conseguiu responder.");
    } finally {
      setPendingMessage(null);
      setBusy(null);
    }
  }

  const suggestions = [
    "Quais são os melhores dias para marcarmos algo nas próximas duas semanas?",
    "Qual é o próximo evento e quem já confirmou presença?",
    "Existem votações abertas que ainda precisam de resposta?",
    "Resuma os comunicados recentes da comunidade.",
  ];

  return (
    <div className="ai-workspace">
      <aside className="card ai-conversation-sidebar" aria-label="Suas conversas com a IA">
        <div className="card-header">
          <div>
            <div className="eyebrow">Histórico privado</div>
            <h2>Conversas</h2>
          </div>
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={newConversation}
            type="button"
          >
            Nova
          </button>
        </div>
        <div className="ai-conversation-list">
          {conversations.map((conversation) => (
            <div className={conversation.id === activeId ? "active" : ""} key={conversation.id}>
              <button
                aria-current={conversation.id === activeId ? "true" : undefined}
                disabled={busy === "send"}
                onClick={() => openConversation(conversation.id)}
                type="button"
              >
                <strong>{conversation.title}</strong>
                <small>{conversation.messageCount} mensagens</small>
              </button>
              <button
                aria-label={`Excluir conversa ${conversation.title}`}
                className="ai-delete-conversation"
                disabled={Boolean(busy)}
                onClick={() => deleteConversation(conversation.id)}
                title="Excluir conversa"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          {!conversations.length && (
            <p className="muted small">Sua primeira conversa aparecerá aqui.</p>
          )}
        </div>
      </aside>

      <section className="card ai-chat-panel" aria-labelledby="ai-chat-title">
        <div className="ai-chat-header">
          <div>
            <span className="ai-orb" aria-hidden="true">
              ✦
            </span>
            <div>
              <h2 id="ai-chat-title">{assistantName}</h2>
              <span className="muted small">
                Modelo {model} · contexto atualizado a cada pergunta
              </span>
            </div>
          </div>
          <span className="status-dot active">Local e privado</span>
        </div>

        <div aria-live="polite" className="ai-message-list">
          {!messages.length && !pendingMessage && (
            <div className="ai-welcome">
              <span aria-hidden="true">✦</span>
              <h3>Como posso ajudar a turma?</h3>
              <p className="muted">
                Eu consulto somente as áreas liberadas pelos administradores e respondo com os dados
                atuais da comunidade.
              </p>
              <div className="ai-suggestions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => setDraft(suggestion)} type="button">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article
              className={`ai-message ai-message-${message.role.toLowerCase()}`}
              key={message.id}
            >
              <strong>{message.role === "USER" ? "Você" : assistantName}</strong>
              {message.role === "ASSISTANT" ? (
                <RichText value={message.content} />
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))}
          {pendingMessage && (
            <>
              <article className="ai-message ai-message-user ai-message-pending">
                <strong>Você</strong>
                <p>{pendingMessage}</p>
              </article>
              <article className="ai-message ai-message-assistant ai-thinking">
                <strong>{assistantName}</strong>
                <p>
                  <span aria-hidden="true">● ● ●</span> Consultando a comunidade e pensando…
                </p>
              </article>
            </>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="error ai-chat-error" role="alert">
            {error}
          </div>
        )}
        <form className="ai-composer" onSubmit={send}>
          <label className="sr-only" htmlFor="ai-message">
            Mensagem para {assistantName}
          </label>
          <textarea
            disabled={busy === "send"}
            id="ai-message"
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Pergunte algo sobre a comunidade…"
            rows={3}
            value={draft}
          />
          <div>
            <span className="muted small">Enter envia · Shift+Enter quebra a linha</span>
            <button
              className="button"
              disabled={busy !== null || draft.trim().length < 2}
              type="submit"
            >
              {busy === "send" ? "Pensando…" : "Enviar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
