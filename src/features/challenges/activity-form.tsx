"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ACTIVITY_PHOTO_ACCEPT,
  MAX_ACTIVITY_PHOTOS,
  MAX_ACTIVITY_PHOTO_BYTES,
} from "@/lib/challenge-activities";
import { civilDateInTimeZone } from "@/lib/dates/civil-date";
import { challengeActivitySchema } from "@/lib/validation/challenge-activity";
import { formatModalityScoring, getChallengeModalities } from "@/lib/fitness-modalities";
import type { ChallengeDetail } from "@/server/services/challenge-service";

export function ActivityForm({
  challenge,
  communityId,
}: {
  challenge: ChallengeDetail;
  communityId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);
  const rules = challenge.configuration.activityRules;
  const modalities = getChallengeModalities(challenge.configuration);
  const [activityType, setActivityType] = useState(modalities[0]?.id ?? "");
  const selectedModality = modalities.find((modality) => modality.id === activityType);
  const distanceRequired =
    challenge.configuration.scoring.metric === "DISTANCE" ||
    selectedModality?.pointsPerMetric?.metric === "DISTANCE";
  const today = civilDateInTimeZone(new Date(), challenge.timezone);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setError("");
    setMessage("");
    requestId.current ??= crypto.randomUUID();
    const distance = String(fields.get("distanceKm") ?? "").trim();
    const parsed = challengeActivitySchema.safeParse({
      clientRequestId: requestId.current,
      title: fields.get("title"),
      notes: fields.get("notes"),
      activityType: fields.get("activityType"),
      performedOn: fields.get("performedOn"),
      durationSeconds: Math.round(Number(fields.get("durationMinutes")) * 60),
      distanceMeters: distance ? Math.round(Number(distance) * 1000) : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (rules.requirePhoto && !files.length) {
      setError("Adicione uma foto do treino.");
      return;
    }
    const body = new FormData();
    body.set("payload", JSON.stringify(parsed.data));
    files.forEach((file) => body.append("photos", file));
    setBusy(true);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/challenges/${challenge.id}/activities`,
        { method: "POST", body },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível publicar o treino.");
      requestId.current = null;
      form.reset();
      setFiles([]);
      setMessage("Treino publicado! O ranking foi atualizado.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha no envio. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card activity-composer" aria-labelledby="activity-form-title">
      <h2 id="activity-form-title">Registrar treino</h2>
      <p className="muted">
        Até {rules.maxDailyActivities} treino(s) por dia · mínimo de {rules.minDurationMinutes} min
        · {rules.requirePhoto ? "foto obrigatória" : "foto opcional"}
      </p>
      <form
        onSubmit={submit}
        onChange={() => {
          requestId.current = null;
        }}
        aria-label="Registrar treino"
      >
        <fieldset disabled={busy} className="activity-fieldset">
          <div className="field">
            <label htmlFor="activity-title">Nome do treino</label>
            <input
              name="title"
              id="activity-title"
              required
              minLength={2}
              maxLength={160}
              placeholder="Caminhada no parque"
            />
          </div>
          <div className="challenge-form-row">
            <div className="field">
              <label htmlFor="activity-type">Tipo de treino</label>
              <select
                name="activityType"
                id="activity-type"
                value={activityType}
                onChange={(event) => setActivityType(event.target.value)}
              >
                {modalities.map((modality) => (
                  <option value={modality.id} key={modality.id}>
                    {modality.label}
                    {challenge.configuration.scoring.metric === "POINTS"
                      ? ` · ${formatModalityScoring(modality)}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="activity-date">Dia do treino</label>
              <input
                name="performedOn"
                id="activity-date"
                type="date"
                required
                min={challenge.startDate}
                max={today < challenge.endDate ? today : challenge.endDate}
                defaultValue={today}
              />
              <span className="field-help">Fuso: {challenge.timezone}</span>
            </div>
          </div>
          <div className="challenge-form-row">
            <div className="field">
              <label htmlFor="activity-duration">Duração (minutos)</label>
              <input
                name="durationMinutes"
                id="activity-duration"
                type="number"
                min={rules.minDurationMinutes}
                max={1440}
                step={1}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="activity-distance">
                Distância (km){distanceRequired ? "" : " — opcional"}
              </label>
              <input
                name="distanceKm"
                id="activity-distance"
                type="number"
                min={distanceRequired ? 0.001 : 0}
                max={1000}
                step={0.001}
                required={distanceRequired}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="activity-notes">Como foi? (opcional)</label>
            <textarea name="notes" id="activity-notes" maxLength={2000} rows={3} />
          </div>
          <div className="field">
            <label htmlFor="activity-photos">
              Fotos do treino{rules.requirePhoto ? "" : " (opcional)"}
            </label>
            <input
              name="photos"
              id="activity-photos"
              type="file"
              multiple
              accept={ACTIVITY_PHOTO_ACCEPT}
              required={rules.requirePhoto}
              aria-describedby="activity-photo-help"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                if (
                  selected.length > MAX_ACTIVITY_PHOTOS ||
                  selected.some((file) => file.size > MAX_ACTIVITY_PHOTO_BYTES || !file.size)
                ) {
                  setError("Selecione até 3 fotos, com no máximo 6 MB cada.");
                  event.target.value = "";
                  setFiles([]);
                  return;
                }
                setError("");
                setFiles(selected);
              }}
            />
            <p className="field-help" id="activity-photo-help">
              Até 3 fotos de 6 MB. JPEG, PNG, WebP, GIF ou AVIF. As imagens serão reduzidas e os
              metadados removidos; GIF vira foto estática.
            </p>
          </div>
          {previews.length > 0 && (
            <div className="activity-photo-grid">
              {previews.map((url, index) => (
                <div key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="activity-preview" src={url} alt={`Prévia da foto ${index + 1}`} />
                </div>
              ))}
            </div>
          )}
          <p className="field-help">
            Publique somente treinos reais, de acordo com as regras. A foto não é verificada
            automaticamente.
          </p>
          <button className="button" type="submit">
            {busy ? "Publicando…" : "Publicar treino"}
          </button>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p role="status">{message}</p>
      </form>
    </section>
  );
}
