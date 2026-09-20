"use client";

import type { SocialMediaKind, SocialPostKind, SocialReactionType } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { SOCIAL_MEDIA_ACCEPT, socialReactions } from "@/lib/social";

type SocialPost = {
  id: string;
  kind: SocialPostKind;
  content: string | null;
  createdAt: string;
  author: { name: string; avatarUrl: string | null };
  media: Array<{
    id: string;
    kind: SocialMediaKind;
    contentType: string;
    originalName: string;
    sizeBytes: number;
  }>;
  reactions: Record<SocialReactionType, number>;
  myReaction: SocialReactionType | null;
  commentCount: number;
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { name: string; avatarUrl: string | null };
    canDelete: boolean;
  }>;
  canDelete: boolean;
};

function messageFrom(response: Response) {
  return response
    .json()
    .then((body) => (typeof body?.error === "string" ? body.error : "Não foi possível concluir."))
    .catch(() => "Não foi possível concluir.");
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function SocialFeed({
  communityId,
  communitySlug,
  timezone,
  canAnnounce,
  items,
  page,
  hasNext,
}: {
  communityId: string;
  communitySlug: string;
  timezone: string;
  canAnnounce: boolean;
  items: SocialPost[];
  page: number;
  hasNext: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [announcement, setAnnouncement] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState("");
  const [error, setError] = useState("");

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("payload", JSON.stringify({ kind: announcement ? "ANNOUNCEMENT" : "POST", content }));
    files.forEach((file) => form.append("media", file));
    try {
      const response = await fetch(`/api/communities/${communityId}/social/posts`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error(await messageFrom(response));
      setContent("");
      setAnnouncement(false);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function mutate(key: string, url: string, method: "DELETE" | "PUT", body?: object) {
    setActiveAction(key);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) throw new Error(await messageFrom(response));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir.");
    } finally {
      setActiveAction("");
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("comment");
    if (typeof input !== "string" || !input.trim()) return;
    const key = `comment-${postId}`;
    setActiveAction(key);
    setError("");
    try {
      const response = await fetch(
        `/api/communities/${communityId}/social/posts/${postId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input }),
        },
      );
      if (!response.ok) throw new Error(await messageFrom(response));
      form.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível comentar.");
    } finally {
      setActiveAction("");
    }
  }

  const base = `/api/communities/${communityId}/social/posts`;
  return (
    <>
      <form className="card social-composer" onSubmit={publish}>
        <label htmlFor="social-content">Compartilhe algo com a comunidade</label>
        <textarea
          id="social-content"
          maxLength={5000}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Uma novidade, foto, vídeo ou assunto para a turma…"
          rows={4}
          value={content}
        />
        <div className="social-composer-options">
          <label className="social-file-field">
            <span>Imagem ou vídeo</span>
            <input
              accept={SOCIAL_MEDIA_ACCEPT}
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))}
              ref={fileInput}
              type="file"
            />
            <small>Até 4 anexos; imagens de 6 MB e vídeos MP4/WebM de 25 MB.</small>
          </label>
          {canAnnounce && (
            <label className="checkbox-row social-announcement-toggle">
              <input
                checked={announcement}
                onChange={(event) => setAnnouncement(event.target.checked)}
                type="checkbox"
              />
              Publicar como comunicado geral
            </label>
          )}
        </div>
        {files.length > 0 && (
          <ul className="social-file-list" aria-label="Anexos selecionados">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>{file.name}</li>
            ))}
          </ul>
        )}
        <div className="social-composer-footer">
          <span>{content.length}/5.000</span>
          <button className="button" disabled={busy || (!content.trim() && !files.length)}>
            {busy ? "Publicando…" : announcement ? "Publicar comunicado" : "Publicar"}
          </button>
        </div>
      </form>

      {error && (
        <div className="error social-global-error" role="alert">
          {error}
        </div>
      )}

      <div className="social-feed" aria-live="polite">
        {items.map((post) => (
          <article
            className={`card social-post${post.kind === "ANNOUNCEMENT" ? " social-announcement" : ""}`}
            id={`post-${post.id}`}
            key={post.id}
          >
            <header className="social-post-header">
              <Avatar name={post.author.name} url={post.author.avatarUrl} size="small" />
              <div>
                <strong>{post.author.name}</strong>
                <time dateTime={post.createdAt}>{formatDate(post.createdAt, timezone)}</time>
              </div>
              {post.kind === "ANNOUNCEMENT" && (
                <span className="social-announcement-badge">📣 Comunicado</span>
              )}
              {post.canDelete && (
                <button
                  aria-label={`Excluir publicação de ${post.author.name}`}
                  className="button ghost social-delete"
                  disabled={activeAction === `delete-${post.id}`}
                  onClick={() => {
                    if (window.confirm("Excluir esta publicação e todos os comentários?"))
                      void mutate(`delete-${post.id}`, `${base}/${post.id}`, "DELETE");
                  }}
                  type="button"
                >
                  Excluir
                </button>
              )}
            </header>
            {post.content && <p className="social-post-content">{post.content}</p>}
            {post.media.length > 0 && (
              <div className={`social-media-grid social-media-count-${post.media.length}`}>
                {post.media.map((media) => {
                  const url = `${base}/${post.id}/media/${media.id}`;
                  return media.kind === "IMAGE" ? (
                    <a
                      aria-label={`Abrir ${media.originalName} em tamanho maior`}
                      href={url}
                      key={media.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={media.originalName} loading="lazy" src={url} />
                    </a>
                  ) : (
                    <video controls key={media.id} preload="metadata">
                      <source src={url} type={media.contentType} />
                      Seu navegador não consegue reproduzir este vídeo.
                    </video>
                  );
                })}
              </div>
            )}
            <div className="social-engagement-summary">
              <span>
                {Object.values(post.reactions).reduce((sum, count) => sum + count, 0)} reações
              </span>
              <span>{post.commentCount} comentários</span>
            </div>
            <div className="social-reactions" aria-label="Reagir à publicação">
              {socialReactions.map((reaction) => (
                <button
                  aria-label={`${reaction.label}: ${post.reactions[reaction.type]} reações`}
                  aria-pressed={post.myReaction === reaction.type}
                  className={post.myReaction === reaction.type ? "active" : ""}
                  disabled={activeAction === `reaction-${post.id}`}
                  key={reaction.type}
                  onClick={() =>
                    void mutate(`reaction-${post.id}`, `${base}/${post.id}/reaction`, "PUT", {
                      type: reaction.type,
                    })
                  }
                  title={reaction.label}
                  type="button"
                >
                  <span aria-hidden="true">{reaction.emoji}</span>
                  <small>{post.reactions[reaction.type] || ""}</small>
                </button>
              ))}
            </div>
            <section className="social-comments" aria-label="Comentários">
              {post.commentCount > post.comments.length && (
                <p className="muted small">Mostrando os 20 comentários mais recentes.</p>
              )}
              {post.comments.map((item) => (
                <div className="social-comment" key={item.id}>
                  <Avatar name={item.author.name} url={item.author.avatarUrl} size="small" />
                  <div>
                    <strong>{item.author.name}</strong>
                    <p>{item.content}</p>
                    <time dateTime={item.createdAt}>{formatDate(item.createdAt, timezone)}</time>
                  </div>
                  {item.canDelete && (
                    <button
                      aria-label={`Excluir comentário de ${item.author.name}`}
                      disabled={activeAction === `comment-delete-${item.id}`}
                      onClick={() =>
                        void mutate(
                          `comment-delete-${item.id}`,
                          `${base}/${post.id}/comments/${item.id}`,
                          "DELETE",
                        )
                      }
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <form className="social-comment-form" onSubmit={(event) => comment(event, post.id)}>
                <label className="sr-only" htmlFor={`comment-${post.id}`}>
                  Comentar na publicação de {post.author.name}
                </label>
                <input
                  id={`comment-${post.id}`}
                  maxLength={1000}
                  name="comment"
                  placeholder="Escreva um comentário…"
                  required
                />
                <button
                  className="button secondary"
                  disabled={activeAction === `comment-${post.id}`}
                >
                  {activeAction === `comment-${post.id}` ? "Enviando…" : "Comentar"}
                </button>
              </form>
            </section>
          </article>
        ))}
        {!items.length && (
          <div className="card empty-state">
            <span className="empty-icon" aria-hidden="true">
              💬
            </span>
            <h2>A conversa começa aqui</h2>
            <p className="muted">Publique a primeira novidade da comunidade.</p>
          </div>
        )}
      </div>
      {(page > 1 || hasNext) && (
        <nav className="pagination" aria-label="Paginação das publicações">
          {page > 1 ? (
            <Link
              className="button secondary"
              href={`/app/${communitySlug}/social?page=${page - 1}`}
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span>Página {page}</span>
          {hasNext && (
            <Link
              className="button secondary"
              href={`/app/${communitySlug}/social?page=${page + 1}`}
            >
              Próxima
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
