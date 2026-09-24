"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar as instruções.");
      setMessage(payload.message || "Confira seu e-mail para continuar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar as instruções.");
    } finally {
      setPending(false);
    }
  }

  if (message)
    return (
      <div className="auth-result" role="status">
        <span aria-hidden="true">✓</span>
        <h2>Solicitação recebida</h2>
        <p>{message}</p>
        <p className="muted small">O link, quando enviado, permanece válido por 30 minutos.</p>
        <Link className="button" href="/login">
          Voltar ao login
        </Link>
      </div>
    );

  return (
    <form className="form" onSubmit={submit}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="recovery-email">E-mail da conta</label>
        <input autoComplete="email" id="recovery-email" name="email" required type="email" />
      </div>
      <button className="button" disabled={pending} type="submit">
        {pending ? "Enviando…" : "Enviar instruções"}
      </button>
      <Link className="auth-secondary-link" href="/login">
        ← Voltar ao login
      </Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(value && value.length >= 32 ? value : null);
    setReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível redefinir sua senha.");
      window.history.replaceState(null, "", "/reset-password?completed=1");
      setCompleted(true);
      setToken(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível redefinir sua senha.");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <p className="muted">Preparando redefinição segura…</p>;

  if (completed)
    return (
      <div className="auth-result" role="status">
        <span aria-hidden="true">✓</span>
        <h2>Senha alterada</h2>
        <p>Sua nova senha já está ativa. As sessões anteriores foram encerradas.</p>
        <Link className="button" href="/login">
          Entrar com a nova senha
        </Link>
      </div>
    );

  if (!token)
    return (
      <div className="auth-result invalid">
        <span aria-hidden="true">!</span>
        <h2>Link incompleto</h2>
        <p>Solicite um novo e-mail para receber um link válido de redefinição.</p>
        <Link className="button" href="/forgot-password">
          Solicitar novo link
        </Link>
      </div>
    );

  return (
    <form className="form" onSubmit={submit}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="reset-password">Nova senha</label>
        <input
          autoComplete="new-password"
          id="reset-password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>
      <div className="field">
        <label htmlFor="reset-confirm-password">Confirmar nova senha</label>
        <input
          autoComplete="new-password"
          id="reset-confirm-password"
          maxLength={128}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </div>
      <button className="button" disabled={pending} type="submit">
        {pending ? "Salvando…" : "Criar nova senha"}
      </button>
    </form>
  );
}
