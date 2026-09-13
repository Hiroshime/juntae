"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { challengeMetricLabels } from "@/lib/challenges";
import { addCivilDays, civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeSchema } from "@/lib/validation/challenge";
import type { ChallengeDetail } from "@/server/services/challenge-service";
import { fitnessModalityLabels, getChallengeModalities } from "@/lib/fitness-modalities";
import { ModalityPicker, type ModalityChoice } from "@/features/challenges/modality-picker";

export function ChallengeForm({
  communityId,
  slug,
  timezone,
  initial,
  onSaved,
}: {
  communityId: string;
  slug: string;
  timezone: string;
  initial?: ChallengeDetail;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [modalities, setModalities] = useState<ModalityChoice[]>(() => {
    const existing = initial ? getChallengeModalities(initial.configuration) : undefined;
    const catalog = Object.entries(fitnessModalityLabels).map(([id, label]) => {
      const saved = existing?.find((item) => item.id === id);
      return {
        id,
        label,
        points: saved?.points ?? 10,
        ...(saved?.pointsPerMetric ? { pointsPerMetric: saved.pointsPerMetric } : {}),
        enabled: existing ? Boolean(saved) : true,
      };
    });
    return [
      ...catalog,
      ...(existing
        ?.filter((item) => item.id.startsWith("CUSTOM_"))
        .map((item) => ({ ...item, enabled: true })) ?? []),
    ];
  });
  const [metric, setMetric] = useState<keyof typeof challengeMetricLabels>(
    initial?.configuration.scoring.metric ?? "POINTS",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tomorrow = addCivilDays(civilDateInTimeZone(new Date(), timezone), 1);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const input = challengeSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      rules: form.get("rules"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
      timezone: form.get("timezone"),
      configuration: {
        version: 1,
        type: "FITNESS",
        modalities: modalities
          .filter((item) => item.enabled)
          .map(({ id, label, points, pointsPerMetric }) => ({
            id,
            label,
            points,
            ...(pointsPerMetric ? { pointsPerMetric } : {}),
          })),
        activityRules: {
          maxDailyActivities: Number(form.get("maxDailyActivities")),
          minDurationMinutes: Number(form.get("minDurationMinutes")),
          requirePhoto: form.get("requirePhoto") === "on",
        },
        scoring: metric === "POINTS" ? { metric, pointsPerActivity: 10 } : { metric },
      },
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/challenges${initial ? `/${initial.id}` : ""}`,
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.data),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o desafio.");
      if (initial) onSaved?.();
      else router.push(`/app/${slug}/challenges/${result.challenge.id}`);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="card form challenge-form"
      onSubmit={submit}
      aria-label={initial ? "Editar desafio" : "Novo desafio"}
    >
      <span className="pill">Fitness</span>
      <div className="field">
        <label htmlFor="challenge-title">Nome do desafio</label>
        <input
          id="challenge-title"
          name="title"
          required
          minLength={2}
          maxLength={160}
          defaultValue={initial?.title}
          placeholder="30 dias em movimento"
        />
      </div>
      <div className="field">
        <label htmlFor="challenge-description">Descrição (opcional)</label>
        <textarea
          id="challenge-description"
          name="description"
          maxLength={5000}
          rows={3}
          defaultValue={initial?.description ?? ""}
          placeholder="Qual é o objetivo do grupo?"
        />
      </div>
      <div className="challenge-form-row">
        <div className="field">
          <label htmlFor="challenge-start">Data inicial</label>
          <input
            id="challenge-start"
            name="startDate"
            type="date"
            required
            defaultValue={initial?.startDate ?? tomorrow}
          />
        </div>
        <div className="field">
          <label htmlFor="challenge-end">Data final (inclusive)</label>
          <input
            id="challenge-end"
            name="endDate"
            type="date"
            required
            defaultValue={initial?.endDate ?? addCivilDays(tomorrow, 29)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="challenge-timezone">Fuso horário</label>
        <input
          id="challenge-timezone"
          name="timezone"
          required
          maxLength={64}
          defaultValue={initial?.timezone ?? timezone}
          aria-describedby="challenge-period-help"
        />
        <p className="field-help" id="challenge-period-help">
          De 1 a 366 dias, incluindo todo o último dia no fuso escolhido. Exemplo:
          America/Sao_Paulo.
        </p>
      </div>
      <div className="challenge-form-row">
        <div className="field">
          <label htmlFor="challenge-metric">Como comparar os treinos?</label>
          <select
            id="challenge-metric"
            value={metric}
            onChange={(event) =>
              setMetric(event.target.value as keyof typeof challengeMetricLabels)
            }
          >
            {Object.entries(challengeMetricLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ModalityPicker
        choices={modalities}
        onChange={setModalities}
        points={metric === "POINTS"}
        disabled={busy}
      />
      <div className="field">
        <label htmlFor="challenge-rules">Regras combinadas</label>
        <textarea
          id="challenge-rules"
          name="rules"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          defaultValue={initial?.rules}
          placeholder="Quais atividades valem? O que o grupo considera um treino válido?"
          aria-describedby="challenge-rules-help"
        />
        <p className="field-help" id="challenge-rules-help">
          As regras, datas e demais informações não podem mudar depois da primeira inscrição ou do
          início.
        </p>
      </div>
      <div className="challenge-form-row">
        <div className="field">
          <label htmlFor="challenge-daily-limit">Máximo de treinos por dia</label>
          <input
            id="challenge-daily-limit"
            name="maxDailyActivities"
            type="number"
            min={1}
            max={10}
            step={1}
            required
            defaultValue={initial?.configuration.activityRules.maxDailyActivities ?? 1}
          />
        </div>
        <div className="field">
          <label htmlFor="challenge-min-duration">Duração mínima (minutos)</label>
          <input
            id="challenge-min-duration"
            name="minDurationMinutes"
            type="number"
            min={1}
            max={1440}
            step={1}
            required
            defaultValue={initial?.configuration.activityRules.minDurationMinutes ?? 10}
          />
        </div>
      </div>
      <label className="checkbox-label">
        <input
          name="requirePhoto"
          type="checkbox"
          defaultChecked={initial?.configuration.activityRules.requirePhoto ?? true}
        />{" "}
        Exigir foto do treino
      </label>
      <p className="challenge-notice">
        Os treinos válidos entram no feed e somam no ranking. Fotos são comprovantes compartilhados
        com o grupo, sem verificação automática de autenticidade.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="challenge-actions">
        <button className="button" disabled={busy} type="submit">
          {busy ? "Salvando…" : initial ? "Salvar alterações" : "Criar desafio"}
        </button>
        {!initial && (
          <Link className="button secondary" href={`/app/${slug}/challenges`}>
            Voltar
          </Link>
        )}
      </div>
    </form>
  );
}
