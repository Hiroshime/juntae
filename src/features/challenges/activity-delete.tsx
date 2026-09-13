"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ActivityDelete({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível remover o treino.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao remover treino.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {confirm ? (
        <>
          <p>Remover este treino e suas fotos? A pontuação será retirada do ranking.</p>
          <div className="challenge-actions">
            <button className="button secondary" disabled={busy} onClick={remove}>
              Confirmar remoção
            </button>
            <button className="button ghost" disabled={busy} onClick={() => setConfirm(false)}>
              Manter treino
            </button>
          </div>
        </>
      ) : (
        <button className="button ghost" onClick={() => setConfirm(true)}>
          Remover treino
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
