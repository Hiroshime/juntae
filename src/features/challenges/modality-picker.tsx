"use client";

import { useState } from "react";
import { normalizeModalityName, type FitnessModality } from "@/lib/fitness-modalities";

export type ModalityChoice = FitnessModality & { enabled: boolean };
export function ModalityPicker({
  choices,
  onChange,
  points,
  disabled,
}: {
  choices: ModalityChoice[];
  onChange: (choices: ModalityChoice[]) => void;
  points: boolean;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  function add() {
    const label = name.trim();
    if (label.length < 2 || label.length > 60) {
      setError("Use um nome de 2 a 60 caracteres.");
      return;
    }
    if (
      choices.some((item) => normalizeModalityName(item.label) === normalizeModalityName(label))
    ) {
      setError("Esta modalidade já está na lista. Habilite-a abaixo.");
      return;
    }
    if (choices.length >= 40) {
      setError("Use até 40 modalidades.");
      return;
    }
    onChange([
      ...choices,
      {
        id: `CUSTOM_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
        label,
        points: 10,
        enabled: true,
      },
    ]);
    setName("");
    setError("");
  }
  function setMetric(id: string, metric: "DURATION" | "DISTANCE") {
    onChange(
      choices.map((row) =>
        row.id === id
          ? { ...row, pointsPerMetric: { metric, unitValue: metric === "DURATION" ? 180 : 1000 } }
          : row,
      ),
    );
  }
  return (
    <fieldset disabled={disabled} className="activity-fieldset">
      <legend>Modalidades permitidas</legend>
      <p className="field-help">
        Habilite pelo menos uma modalidade.{" "}
        {points &&
          "Escolha pontos fixos por treino ou pontos proporcionais ao tempo/distância, com uma casa decimal."}
      </p>
      <div className="challenge-actions">
        <button
          type="button"
          className="button ghost"
          onClick={() => onChange(choices.map((item) => ({ ...item, enabled: true })))}
        >
          Habilitar todas
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => onChange(choices.map((item) => ({ ...item, enabled: false })))}
        >
          Desabilitar todas
        </button>
      </div>
      <div className="modality-list">
        {choices.map((item) => (
          <div className="modality-row" key={item.id}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) =>
                  onChange(
                    choices.map((row) =>
                      row.id === item.id ? { ...row, enabled: event.target.checked } : row,
                    ),
                  )
                }
              />
              {item.label}
            </label>
            {points && (
              <div className="modality-scoring">
                <div className="field">
                  <label htmlFor={`points-mode-${item.id}`}>Como pontuar: {item.label}</label>
                  <select
                    id={`points-mode-${item.id}`}
                    value={item.pointsPerMetric ? "METRIC" : "ACTIVITY"}
                    onChange={(event) => {
                      if (event.target.value === "ACTIVITY")
                        onChange(
                          choices.map((row) =>
                            row.id === item.id ? { ...row, pointsPerMetric: undefined } : row,
                          ),
                        );
                      else setMetric(item.id, item.pointsPerMetric?.metric ?? "DURATION");
                    }}
                  >
                    <option value="ACTIVITY">Pontos por treino</option>
                    <option value="METRIC">Pontos por métrica</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`points-${item.id}`}>
                    {item.pointsPerMetric ? "Pontos por unidade" : "Pontos por treino"} —{" "}
                    {item.label}
                  </label>
                  <input
                    id={`points-${item.id}`}
                    type="number"
                    min={1}
                    max={1000}
                    step={1}
                    required={item.enabled}
                    disabled={!item.enabled}
                    value={item.points || ""}
                    onChange={(event) =>
                      onChange(
                        choices.map((row) =>
                          row.id === item.id ? { ...row, points: Number(event.target.value) } : row,
                        ),
                      )
                    }
                  />
                </div>
                {item.pointsPerMetric && (
                  <>
                    <div className="field">
                      <label htmlFor={`metric-${item.id}`}>Métrica — {item.label}</label>
                      <select
                        id={`metric-${item.id}`}
                        value={item.pointsPerMetric.metric}
                        onChange={(event) =>
                          setMetric(item.id, event.target.value as "DURATION" | "DISTANCE")
                        }
                      >
                        <option value="DURATION">Tempo</option>
                        <option value="DISTANCE">Distância</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`unit-${item.id}`}>Unidade — {item.label}</label>
                      <input
                        id={`unit-${item.id}`}
                        type="number"
                        min={item.pointsPerMetric.metric === "DURATION" ? 1 : 0.001}
                        max={item.pointsPerMetric.metric === "DURATION" ? 1440 : 1000}
                        step={item.pointsPerMetric.metric === "DURATION" ? 1 : 0.001}
                        required={item.enabled}
                        value={
                          item.pointsPerMetric.metric === "DURATION"
                            ? item.pointsPerMetric.unitValue / 60
                            : item.pointsPerMetric.unitValue / 1000
                        }
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          const unitValue =
                            item.pointsPerMetric?.metric === "DURATION"
                              ? Math.round(value * 60)
                              : Math.round(value * 1000);
                          onChange(
                            choices.map((row) =>
                              row.id === item.id && row.pointsPerMetric
                                ? {
                                    ...row,
                                    pointsPerMetric: { ...row.pointsPerMetric, unitValue },
                                  }
                                : row,
                            ),
                          );
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
            {item.id.startsWith("CUSTOM_") && (
              <button
                type="button"
                className="button ghost"
                aria-label={`Remover modalidade ${item.label}`}
                onClick={() => onChange(choices.filter((row) => row.id !== item.id))}
              >
                Remover
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="field">
        <label htmlFor="custom-modality">Modalidade personalizada</label>
        <input
          id="custom-modality"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Beach tennis"
        />
      </div>
      <button type="button" className="button secondary" onClick={add}>
        Adicionar modalidade
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
