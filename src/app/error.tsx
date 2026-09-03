"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth-wrap">
      <section className="card error-state" role="alert">
        <span className="error-state-icon" aria-hidden="true">
          !
        </span>
        <div className="eyebrow">Algo não saiu como esperado</div>
        <h1>Não foi possível carregar esta tela</h1>
        <p className="muted">
          Tente novamente. Se o problema continuar, volte para suas comunidades e escolha outro
          caminho.
        </p>
        <div className="actions">
          <button className="button" onClick={reset} type="button">
            Tentar novamente
          </button>
          <Link className="button secondary" href="/app">
            Ir para comunidades
          </Link>
        </div>
      </section>
    </main>
  );
}
