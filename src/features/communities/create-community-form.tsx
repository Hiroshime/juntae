"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function CreateCommunityForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    const data = (await response.json()) as { error?: string; community?: { slug: string } };
    if (!response.ok || !data.community) {
      setError(data.error ?? "Não foi possível criar a comunidade.");
      setLoading(false);
      return;
    }
    router.push(`/app/${data.community.slug}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="button" type="button" onClick={() => setOpen(true)}>
        Criar comunidade
      </button>
    );
  }

  return (
    <section className="card form-card">
      <div className="card-header">
        <div>
          <h2>Nova comunidade</h2>
          <p className="muted small">Você será o primeiro owner.</p>
        </div>
        <button className="button ghost" type="button" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
      <form className="form" onSubmit={submit}>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="community-name">Nome</label>
          <input id="community-name" name="name" minLength={2} maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="community-description">Descrição</label>
          <textarea id="community-description" name="description" maxLength={1000} rows={3} />
        </div>
        <div className="field">
          <label htmlFor="community-avatar">URL do avatar (opcional)</label>
          <input id="community-avatar" name="avatarUrl" type="url" />
        </div>
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Criando…" : "Criar comunidade"}
        </button>
      </form>
    </section>
  );
}
