"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { addPollOptionSchema } from "@/lib/validation/poll";

export function AddPollOptionForm({
  communityId,
  pollId,
  questionId,
  questionTitle,
  isDate,
  optionCount,
}: {
  communityId: string;
  pollId: string;
  questionId?: string;
  questionTitle?: string;
  isDate: boolean;
  optionCount: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const prefix = `new-option-${questionId || pollId}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    const parsed = addPollOptionSchema.safeParse({
      ...fields,
      questionId,
      label: isDate ? fields.dateValue : fields.label,
    });
    setMessage("");
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Confira a opção.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/communities/${communityId}/polls/${pollId}/options`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível adicionar a opção.");
      form.reset();
      setMessage("Opção adicionada. Os votos existentes foram preservados.");
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar a opção.");
    } finally {
      setSaving(false);
    }
  }
  if (optionCount >= 20)
    return <p className="muted small">Esta pergunta atingiu o limite de 20 opções.</p>;
  return (
    <details className="card poll-add-option">
      <summary>Adicionar opção</summary>
      <form
        className="form"
        onSubmit={submit}
        aria-label={questionTitle ? `Adicionar opção: ${questionTitle}` : "Adicionar opção"}
      >
        <fieldset className="poll-add-fields" disabled={saving || refreshing}>
          <div className="field">
            <label htmlFor={prefix}>{isDate ? "Nova data" : "Nova opção"}</label>
            <input
              id={prefix}
              name={isDate ? "dateValue" : "label"}
              type={isDate ? "date" : "text"}
              required
              maxLength={160}
              placeholder={isDate ? undefined : "Ex.: Yakisoba"}
            />
          </div>
          {!isDate && (
            <>
              <div className="field">
                <label htmlFor={`${prefix}-description`}>Descrição da opção (opcional)</label>
                <textarea
                  id={`${prefix}-description`}
                  name="description"
                  maxLength={1500}
                  rows={2}
                />
              </div>
              <div className="field">
                <label htmlFor={`${prefix}-website`}>Página web (opcional)</label>
                <input id={`${prefix}-website`} name="websiteUrl" type="url" maxLength={2000} />
              </div>
              <div className="field">
                <label htmlFor={`${prefix}-location`}>Local (opcional)</label>
                <input id={`${prefix}-location`} name="location" maxLength={300} />
              </div>
            </>
          )}
          <button className="button secondary" type="submit">
            {saving ? "Adicionando…" : "Adicionar à votação"}
          </button>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="small" role="status" aria-live="polite">
          {message}
        </p>
      </form>
    </details>
  );
}
