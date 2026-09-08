"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { PollType } from "@prisma/client";
import { zonedDateTimeToUtc } from "@/lib/dates/civil-date";
import {
  MAX_POLL_ALBUM_BYTES,
  MAX_POLL_IMAGE_BYTES,
  MAX_POLL_OPTION_IMAGES,
  POLL_IMAGE_ACCEPT,
} from "@/lib/polls/images";

type SuggestedDate = {
  date: string;
  fullAvailableCount: number;
  unknownCount: number;
  score: number;
  totalMembers: number;
};

type DraftOption = {
  label: string;
  description: string;
  imageUrl: string;
  websiteUrl: string;
  location: string;
  images: File[];
};

type DraftOptionTextField = Exclude<keyof DraftOption, "images">;

const emptyOption = (): DraftOption => ({
  label: "",
  description: "",
  imageUrl: "",
  websiteUrl: "",
  location: "",
  images: [],
});

function localDateTimeToUtc(value: string, timezone: string) {
  const [date, time] = value.split("T");
  return zonedDateTimeToUtc(date, time, timezone).toISOString();
}

export function PollForm({
  communityId,
  communitySlug,
  timezone,
  suggestions,
  preferredDate,
}: {
  communityId: string;
  communitySlug: string;
  timezone: string;
  suggestions: SuggestedDate[];
  preferredDate?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<PollType>("SINGLE_CHOICE");
  const [options, setOptions] = useState([emptyOption(), emptyOption(), emptyOption()]);
  const [selectedDates, setSelectedDates] = useState(() => {
    const orderedDates = [
      ...(preferredDate ? [preferredDate] : []),
      ...suggestions.map((suggestion) => suggestion.date),
    ];
    return new Set(Array.from(new Set(orderedDates)).slice(0, 3));
  });
  const [manualDates, setManualDates] = useState<string[]>([""]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = useMemo(
    () => new Set([...selectedDates, ...manualDates.filter(Boolean)]).size,
    [manualDates, selectedDates],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const closesAt = String(form.get("closesAt") || "");
    const common = {
      title: String(form.get("title")),
      description: String(form.get("description") || ""),
      type,
      allowVoteChange: form.get("allowVoteChange") === "on",
      closesAt: closesAt ? localDateTimeToUtc(closesAt, timezone) : null,
    };
    const publishedOptions = options.filter((option) => option.label.trim());
    const body =
      type === "DATE_OPTIONS"
        ? {
            ...common,
            dates: Array.from(new Set([...selectedDates, ...manualDates.filter(Boolean)])).sort(),
          }
        : {
            ...common,
            options: publishedOptions.map((option) => ({
              label: option.label.trim(),
              description: option.description.trim(),
              imageUrl: option.imageUrl.trim(),
              websiteUrl: option.websiteUrl.trim(),
              location: option.location.trim(),
            })),
          };
    const hasImages =
      type !== "DATE_OPTIONS" && publishedOptions.some((option) => option.images.length);
    const upload = new FormData();
    if (hasImages) {
      upload.set("payload", JSON.stringify(body));
      publishedOptions.forEach((option, optionIndex) => {
        option.images.forEach((image) => upload.append(`optionImages:${optionIndex}`, image));
      });
    }
    const response = await fetch(
      `/api/communities/${communityId}/polls`,
      hasImages
        ? { method: "POST", body: upload }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      poll?: { id: string };
    };
    setPending(false);
    if (!response.ok || !result.poll) {
      setError(result.error ?? "Não foi possível criar a votação.");
      return;
    }
    router.push(`/app/${communitySlug}/polls/${result.poll.id}`);
    router.refresh();
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function updateOption(index: number, field: DraftOptionTextField, value: string) {
    setOptions((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addOptionImages(index: number, selected: File[]) {
    const optionImages = [...options[index].images, ...selected];
    if (optionImages.length > MAX_POLL_OPTION_IMAGES) {
      setError(`Cada opção pode ter no máximo ${MAX_POLL_OPTION_IMAGES} fotos.`);
      return;
    }
    if (selected.some((file) => file.size === 0 || file.size > MAX_POLL_IMAGE_BYTES)) {
      setError("Cada foto deve ter entre 1 byte e 6 MB.");
      return;
    }
    const totalBytes = options.reduce(
      (total, option, optionIndex) =>
        total +
        (optionIndex === index ? optionImages : option.images).reduce(
          (subtotal, file) => subtotal + file.size,
          0,
        ),
      0,
    );
    if (totalBytes > MAX_POLL_ALBUM_BYTES) {
      setError("Os álbuns da votação podem ter no máximo 30 MB no total.");
      return;
    }
    setError(null);
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, images: optionImages } : option,
      ),
    );
  }

  function removeOptionImage(optionIndex: number, imageIndex: number) {
    setOptions((current) =>
      current.map((option, index) =>
        index === optionIndex
          ? { ...option, images: option.images.filter((_, fileIndex) => fileIndex !== imageIndex) }
          : option,
      ),
    );
  }

  return (
    <form className="card form poll-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="poll-title">Título</label>
        <input id="poll-title" name="title" maxLength={160} required />
      </div>
      <div className="field">
        <label htmlFor="poll-description">Descrição</label>
        <textarea id="poll-description" name="description" maxLength={5000} rows={4} />
      </div>
      <div className="field">
        <label htmlFor="poll-type">Tipo de votação</label>
        <select
          id="poll-type"
          value={type}
          onChange={(event) => setType(event.target.value as PollType)}
        >
          <option value="SINGLE_CHOICE">Escolha única</option>
          <option value="MULTIPLE_CHOICE">Múltipla escolha</option>
          <option value="DATE_OPTIONS">Datas sugeridas</option>
        </select>
        <span className="field-help">
          {type === "SINGLE_CHOICE"
            ? "Cada membro escolhe uma opção."
            : type === "MULTIPLE_CHOICE"
              ? "Cada membro pode selecionar várias opções."
              : "Cada membro marca todas as datas que funcionam para ele."}
        </span>
      </div>
      {type === "DATE_OPTIONS" ? (
        <fieldset className="poll-options-fieldset">
          <legend>Datas candidatas</legend>
          <p className="muted small">
            Sugestões ordenadas pela disponibilidade da comunidade. Selecione pelo menos duas.
          </p>
          <div className="date-suggestion-grid">
            {suggestions.map((suggestion) => (
              <label className="date-suggestion" key={suggestion.date}>
                <input
                  checked={selectedDates.has(suggestion.date)}
                  onChange={() => toggleDate(suggestion.date)}
                  type="checkbox"
                />
                <span>
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    }).format(new Date(`${suggestion.date}T00:00:00Z`))}
                  </strong>
                  <small>
                    {suggestion.fullAvailableCount}/{suggestion.totalMembers} livres · score{" "}
                    {suggestion.score}
                  </small>
                  <small>{suggestion.unknownCount} sem informação</small>
                </span>
              </label>
            ))}
          </div>
          <div className="manual-dates">
            <strong>Outras datas</strong>
            {manualDates.map((date, index) => (
              <div className="option-editor-row" key={index}>
                <div className="field">
                  <label htmlFor={`manual-date-${index}`}>Data adicional {index + 1}</label>
                  <input
                    id={`manual-date-${index}`}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setManualDates((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    type="date"
                    value={date}
                  />
                </div>
                {manualDates.length > 1 && (
                  <button
                    aria-label={`Remover data adicional ${index + 1}`}
                    className="button ghost"
                    onClick={() =>
                      setManualDates((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
            {manualDates.length < 5 && (
              <button
                className="button secondary"
                onClick={() => setManualDates((current) => [...current, ""])}
                type="button"
              >
                Adicionar outra data
              </button>
            )}
            <span className="field-help">{selectedCount} datas selecionadas.</span>
          </div>
        </fieldset>
      ) : (
        <fieldset className="poll-options-fieldset">
          <legend>Opções</legend>
          <div className="poll-option-editors">
            {options.map((option, index) => (
              <div className="poll-option-editor" key={index}>
                <div className="option-editor-row">
                  <div className="field">
                    <label htmlFor={`poll-option-${index}`}>Opção {index + 1}</label>
                    <input
                      id={`poll-option-${index}`}
                      maxLength={160}
                      onChange={(event) => updateOption(index, "label", event.target.value)}
                      placeholder="Ex.: Chácara Recanto Verde"
                      required={index < 2}
                      value={option.label}
                    />
                  </div>
                  {options.length > 2 && (
                    <button
                      aria-label={`Remover opção ${index + 1}`}
                      className="button ghost"
                      onClick={() =>
                        setOptions((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <details className="poll-option-details">
                  <summary>Adicionar álbum, descrição, página ou local</summary>
                  <div className="field">
                    <label htmlFor={`poll-option-images-${index}`}>Fotos do álbum</label>
                    <input
                      accept={POLL_IMAGE_ACCEPT}
                      id={`poll-option-images-${index}`}
                      multiple
                      onChange={(event) => {
                        addOptionImages(index, Array.from(event.target.files ?? []));
                        event.target.value = "";
                      }}
                      type="file"
                    />
                    <span className="field-help">
                      Até 6 fotos por opção, 6 MB por foto. JPEG, PNG, WebP, GIF ou AVIF.
                    </span>
                    {option.images.length > 0 && (
                      <div className="poll-image-file-list" aria-label="Fotos selecionadas">
                        {option.images.map((image, imageIndex) => (
                          <span key={`${image.name}-${image.lastModified}-${imageIndex}`}>
                            <span title={image.name}>{image.name}</span>
                            <button
                              aria-label={`Remover foto ${image.name}`}
                              onClick={() => removeOptionImage(index, imageIndex)}
                              type="button"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor={`poll-option-description-${index}`}>Descrição da opção</label>
                    <textarea
                      id={`poll-option-description-${index}`}
                      maxLength={1500}
                      onChange={(event) => updateOption(index, "description", event.target.value)}
                      rows={3}
                      value={option.description}
                    />
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor={`poll-option-image-${index}`}>URL de foto externa</label>
                      <input
                        id={`poll-option-image-${index}`}
                        maxLength={2000}
                        onChange={(event) => updateOption(index, "imageUrl", event.target.value)}
                        placeholder="https://"
                        type="url"
                        value={option.imageUrl}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`poll-option-website-${index}`}>Página web</label>
                      <input
                        id={`poll-option-website-${index}`}
                        maxLength={2000}
                        onChange={(event) => updateOption(index, "websiteUrl", event.target.value)}
                        placeholder="https://"
                        type="url"
                        value={option.websiteUrl}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`poll-option-location-${index}`}>Local ou endereço</label>
                    <input
                      id={`poll-option-location-${index}`}
                      maxLength={300}
                      onChange={(event) => updateOption(index, "location", event.target.value)}
                      placeholder="Cidade, bairro ou endereço"
                      value={option.location}
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
          {options.length < 20 && (
            <button
              className="button secondary"
              onClick={() => setOptions((current) => [...current, emptyOption()])}
              type="button"
            >
              Adicionar opção
            </button>
          )}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor="poll-closes">Prazo para votar (opcional)</label>
        <input id="poll-closes" name="closesAt" type="datetime-local" />
        <span className="field-help">Horário interpretado em {timezone}.</span>
      </div>
      <label className="toggle-row">
        <input defaultChecked name="allowVoteChange" type="checkbox" />
        Permitir que membros alterem o voto
      </label>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="actions compact-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "Publicando…" : "Criar votação"}
        </button>
        <button className="button ghost" onClick={() => router.back()} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
