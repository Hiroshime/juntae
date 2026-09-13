"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChallengeForm } from "@/features/challenges/challenge-form";
import type { ChallengeAction } from "@/lib/validation/challenge";
import type { ChallengeDetail } from "@/server/services/challenge-service";

export function ChallengeActions({
  challenge,
  communityId,
  slug,
}: {
  challenge: ChallengeDetail;
  communityId: string;
  slug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  async function act(action: ChallengeAction) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/communities/${communityId}/challenges/${challenge.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
      setMessage(
        action === "JOIN"
          ? "Você entrou no desafio!"
          : action === "LEAVE"
            ? "Você saiu do desafio."
            : "Desafio cancelado.",
      );
      setConfirmCancel(false);
      setEditing(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="challenge-controls">
      <div className="challenge-actions">
        {challenge.canParticipate && (
          <button
            className={`button${challenge.joined ? " secondary" : ""}`}
            disabled={busy}
            onClick={() => act(challenge.joined ? "LEAVE" : "JOIN")}
          >
            {busy ? "Aguarde…" : challenge.joined ? "Sair do desafio" : "Participar do desafio"}
          </button>
        )}
        {challenge.canEdit && (
          <button
            className="button secondary"
            disabled={busy}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Fechar edição" : "Editar desafio"}
          </button>
        )}
        {challenge.canCancel && (
          <button className="button ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>
            Cancelar desafio
          </button>
        )}
      </div>
      {confirmCancel && (
        <div className="card challenge-confirm">
          <p>
            Cancelar este desafio definitivamente? O histórico será preservado, mas ninguém poderá
            entrar ou sair.
          </p>
          <div className="challenge-actions">
            <button className="button" disabled={busy} onClick={() => act("CANCEL")}>
              Confirmar cancelamento
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmCancel(false)}
            >
              Manter desafio
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p role="status">{message}</p>
      {editing && challenge.canEdit && (
        <ChallengeForm
          communityId={communityId}
          slug={slug}
          timezone={challenge.timezone}
          initial={challenge}
          onSaved={() => {
            setEditing(false);
            setMessage("Desafio atualizado.");
          }}
        />
      )}
    </div>
  );
}
