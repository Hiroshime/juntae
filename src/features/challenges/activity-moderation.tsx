"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { challengeModerationSchema } from "@/lib/validation/challenge-moderation";

export function ActivityModeration({
  endpoint,
  invalidated,
  version,
}: {
  endpoint: string;
  invalidated: boolean;
  version: number;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const input = challengeModerationSchema.safeParse({
      action: invalidated ? "RESTORE" : "INVALIDATE",
      reason,
      expectedVersion: version,
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível moderar o treino.");
      setOpen(false);
      setReason("");
      setMessage("Revisão registrada. O ranking foi atualizado.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao registrar revisão.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="button ghost"
        disabled={busy}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {invalidated ? "Restabelecer treino" : "Desconsiderar treino"}
      </button>
      {open && (
        <form className="activity-moderation-form" aria-label="Moderar treino" onSubmit={submit}>
          <p className="muted small">
            {invalidated
              ? "O treino voltará a pontuar."
              : "O treino continuará no feed, mas não contará no ranking."}{" "}
            O motivo fica visível para a comunidade.
          </p>
          <label htmlFor={id}>Motivo da revisão</label>
          <textarea
            id={id}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={10}
            maxLength={1000}
            disabled={busy}
          />
          <button className="button secondary" disabled={busy}>
            {busy ? "Salvando…" : "Confirmar revisão"}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="small" role="status">
        {message}
      </p>
    </div>
  );
}
