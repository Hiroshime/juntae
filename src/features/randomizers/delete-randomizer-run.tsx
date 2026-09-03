"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteRandomizerRun({
  communityId,
  communitySlug,
  runId,
}: {
  communityId: string;
  communitySlug: string;
  runId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm("Remover este resultado salvo do histórico?")) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/communities/${communityId}/randomizers/${runId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Não foi possível remover o resultado.");
      setPending(false);
      return;
    }
    router.push(`/app/${communitySlug}/randomizers`);
    router.refresh();
  }

  return (
    <div>
      <button className="button danger-outline" disabled={pending} onClick={remove} type="button">
        {pending ? "Removendo…" : "Remover do histórico"}
      </button>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
