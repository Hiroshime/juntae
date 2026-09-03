"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loginHref, setLoginHref] = useState("/login");

  useEffect(() => {
    setHydrated(true);
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) {
      setLoginHref(`/login?next=${encodeURIComponent(next)}`);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Não foi possível criar a conta.");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/app");
    router.refresh();
  }

  return (
    <main className="auth-wrap">
      <section className="auth-card card">
        <div className="auth-brand-row">
          <Brand />
          <ThemeSwitcher />
        </div>
        <h1>Crie sua conta</h1>
        <p className="muted">Comece a organizar os próximos encontros.</p>
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
          <button className="button" type="submit" disabled={loading || !hydrated}>
            {loading ? "Criando…" : "Criar conta"}
          </button>
          <p className="muted small">
            Já possui uma conta?{" "}
            <Link href={loginHref} style={{ color: "var(--primary)", fontWeight: 700 }}>
              Entrar
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
