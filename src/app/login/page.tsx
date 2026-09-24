"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthLayout } from "@/features/auth/auth-layout";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [registerHref, setRegisterHref] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) {
      const match = next.match(/^\/join\/([^/?#]+)$/);
      if (match?.[1]) {
        setRegisterHref(
          `/register?invite=${encodeURIComponent(match[1])}&next=${encodeURIComponent(next)}`,
        );
      }
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    const next = new URLSearchParams(window.location.search).get("next");
    router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/app");
    router.refresh();
  }

  return (
    <AuthLayout>
      <h1>Bem-vindo de volta</h1>
      <p className="muted">Entre para continuar organizando os encontros do seu grupo.</p>
      <form className="form" onSubmit={submit}>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <div className="auth-field-heading">
            <label htmlFor="password">Senha</label>
            <Link href="/forgot-password">Esqueci minha senha</Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button className="button" type="submit" disabled={loading || !hydrated}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
        {registerHref ? (
          <p className="muted small">
            Ainda não tem conta?{" "}
            <Link href={registerHref} style={{ color: "var(--primary)", fontWeight: 700 }}>
              Cadastre-se com este convite
            </Link>
          </p>
        ) : (
          <p className="muted small">Ainda não tem conta? Peça um convite a um administrador.</p>
        )}
      </form>
    </AuthLayout>
  );
}
