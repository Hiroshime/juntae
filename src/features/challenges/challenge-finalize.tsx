"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChallengeFinalize({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finalize() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível consolidar.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao consolidar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card" aria-label="Consolidar resultado">
      <h2>Revisão final</h2>
      <p>
        O período terminou. Confira os treinos e resolva as revisões antes de preservar o resultado.
      </p>
      {confirm ? (
        <>
          <p>
            Esta ação é definitiva: nomes, pontuações e posições serão preservados, e nenhuma nova
            moderação será aceita. Confirma?
          </p>
          <div className="challenge-actions">
            <button className="button" disabled={busy} onClick={finalize}>
              {busy ? "Consolidando…" : "Confirmar resultado definitivo"}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>
              Continuar revisando
            </button>
          </div>
        </>
      ) : (
        <button className="button" onClick={() => setConfirm(true)}>
          Consolidar resultado final
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
