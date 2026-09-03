"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinActions({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
      method: "POST",
    });
    const data = (await response.json()) as { error?: string; community?: { slug: string } };
    if (!response.ok || !data.community) {
      setError(data.error ?? "Não foi possível aceitar o convite.");
      setLoading(false);
      return;
    }
    router.push(`/app/${data.community.slug}`);
    router.refresh();
  }

  return (
    <div className="form">
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="button" type="button" onClick={accept} disabled={loading}>
        {loading ? "Entrando…" : "Entrar na comunidade"}
      </button>
    </div>
  );
}
