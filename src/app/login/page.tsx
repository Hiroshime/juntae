"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [registerHref, setRegisterHref] = useState("/register");

  useEffect(() => {
    setHydrated(true);
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/") && !next.startsWith("//")) {
      setRegisterHref(`/register?next=${encodeURIComponent(next)}`);
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
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Entre para continuar organizando os encontros do seu grupo."
    >
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
          <label htmlFor="password">Senha</label>
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
        <p className="muted small">
          Ainda não tem conta?{" "}
          <Link href={registerHref} style={{ color: "var(--primary)", fontWeight: 700 }}>
            Cadastre-se
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-wrap">
      <section className="auth-card card">
        <div className="auth-brand-row">
          <Brand />
          <ThemeSwitcher />
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </main>
  );
}
