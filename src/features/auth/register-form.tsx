"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type RegistrationResponse = {
  error?: string;
  community?: { slug: string } | null;
};

export function RegisterForm({
  mode,
  inviteToken,
}: {
  mode: "invite" | "bootstrap";
  inviteToken?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        ...(mode === "invite" ? { inviteToken } : {}),
      }),
    });
    const data = (await response.json()) as RegistrationResponse;
    if (!response.ok) {
      setError(data.error ?? "Não foi possível criar a conta.");
      setLoading(false);
      return;
    }
    router.push(data.community ? `/app/${data.community.slug}` : "/app");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={submit}>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="name">Nome de exibição</label>
        <input id="name" name="name" type="text" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {mode === "bootstrap" && (
        <div className="field">
          <label htmlFor="bootstrap-token">Código inicial</label>
          <input
            id="bootstrap-token"
            name="bootstrapToken"
            type="password"
            autoComplete="off"
            minLength={32}
            required
          />
        </div>
      )}
      <button className="button" type="submit" disabled={loading}>
        {loading ? "Criando…" : "Criar conta"}
      </button>
    </form>
  );
}
