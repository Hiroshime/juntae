"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  MAX_POLL_ALBUM_BYTES,
  MAX_POLL_IMAGE_BYTES,
  MAX_POLL_OPTION_IMAGES,
  POLL_IMAGE_ACCEPT,
} from "@/lib/polls/images";

type ManagedPollImage = {
  id: string;
  url: string;
  originalName: string;
  sizeBytes: number;
};

type ManagedPollOption = {
  id: string;
  label: string;
  images: ManagedPollImage[];
};

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function PollAlbumEditor({
  communityId,
  pollId,
  options,
}: {
  communityId: string;
  pollId: string;
  options: ManagedPollOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, File[]>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    optionId: string;
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const storedBytes = useMemo(
    () =>
      options.reduce(
        (total, option) =>
          total + option.images.reduce((optionTotal, image) => optionTotal + image.sizeBytes, 0),
        0,
      ),
    [options],
  );

  function chooseImages(option: ManagedPollOption, files: File[]) {
    const nextFiles = [...(selected[option.id] ?? []), ...files];
    if (option.images.length + nextFiles.length > MAX_POLL_OPTION_IMAGES) {
      setMessage({
        optionId: option.id,
        kind: "error",
        text: `Esta opção pode ter no máximo ${MAX_POLL_OPTION_IMAGES} fotos.`,
      });
      return;
    }
    if (files.some((file) => file.size === 0 || file.size > MAX_POLL_IMAGE_BYTES)) {
      setMessage({
        optionId: option.id,
        kind: "error",
        text: "Cada foto deve ter entre 1 byte e 6 MB.",
      });
      return;
    }
    const nextBytes = nextFiles.reduce((total, file) => total + file.size, 0);
    if (storedBytes + nextBytes > MAX_POLL_ALBUM_BYTES) {
      setMessage({
        optionId: option.id,
        kind: "error",
        text: "Os álbuns da votação podem ter no máximo 30 MB no total.",
      });
      return;
    }
    setSelected((current) => ({ ...current, [option.id]: nextFiles }));
    setMessage(null);
  }

  function removeSelected(optionId: string, fileIndex: number) {
    setSelected((current) => ({
      ...current,
      [optionId]: (current[optionId] ?? []).filter((_, index) => index !== fileIndex),
    }));
  }

  async function upload(option: ManagedPollOption) {
    const files = selected[option.id] ?? [];
    if (!files.length) return;
    setPendingKey(`upload:${option.id}`);
    setMessage(null);
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    const response = await fetch(
      `/api/communities/${communityId}/polls/${pollId}/options/${option.id}/images`,
      { method: "POST", body },
    );
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPendingKey(null);
    if (!response.ok) {
      setMessage({
        optionId: option.id,
        kind: "error",
        text: result.error ?? "Não foi possível adicionar as fotos.",
      });
      return;
    }
    setSelected((current) => ({ ...current, [option.id]: [] }));
    setMessage({ optionId: option.id, kind: "success", text: "Fotos adicionadas ao álbum." });
    router.refresh();
  }

  async function removeImage(option: ManagedPollOption, image: ManagedPollImage) {
    if (!window.confirm(`Remover a foto “${image.originalName}” deste álbum?`)) return;
    setPendingKey(`delete:${image.id}`);
    setMessage(null);
    const response = await fetch(
      `/api/communities/${communityId}/polls/${pollId}/options/${option.id}/images/${image.id}`,
      { method: "DELETE" },
    );
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    setPendingKey(null);
    if (!response.ok) {
      setMessage({
        optionId: option.id,
        kind: "error",
        text: result.error ?? "Não foi possível remover a foto.",
      });
      return;
    }
    setMessage({ optionId: option.id, kind: "success", text: "Foto removida do álbum." });
    router.refresh();
  }

  return (
    <section className="card poll-album-editor" aria-labelledby="poll-album-editor-title">
      <div className="card-header">
        <div>
          <h2 id="poll-album-editor-title">Álbuns das opções</h2>
          <p className="muted small">
            Adicione ou remova fotos enquanto a votação estiver aberta. O título e os votos não são
            alterados.
          </p>
        </div>
        <span aria-hidden="true">🖼️</span>
      </div>
      <div className="poll-album-editor-options">
        {options.map((option) => {
          const pendingFiles = selected[option.id] ?? [];
          const remaining = MAX_POLL_OPTION_IMAGES - option.images.length;
          return (
            <article className="poll-album-editor-option" key={option.id}>
              <div className="poll-album-editor-heading">
                <strong>{option.label}</strong>
                <span className="badge neutral">
                  {option.images.length}/{MAX_POLL_OPTION_IMAGES} fotos
                </span>
              </div>
              {option.images.length > 0 ? (
                <div className="poll-album-management-grid">
                  {option.images.map((image, index) => (
                    <div className="poll-album-management-image" key={image.id}>
                      {/* Same-origin image endpoint validates session and community membership. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`Foto ${index + 1} de ${option.label}`}
                        decoding="async"
                        loading="lazy"
                        src={image.url}
                      />
                      <div>
                        <span title={image.originalName}>{image.originalName}</span>
                        <small>{formatFileSize(image.sizeBytes)}</small>
                      </div>
                      <button
                        aria-label={`Remover ${image.originalName} de ${option.label}`}
                        className="button danger-outline"
                        disabled={pendingKey !== null}
                        onClick={() => removeImage(option, image)}
                        type="button"
                      >
                        {pendingKey === `delete:${image.id}` ? "Removendo…" : "Remover"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted small">Esta opção ainda não possui fotos.</p>
              )}
              {remaining > 0 && (
                <div className="field">
                  <label htmlFor={`poll-album-files-${option.id}`}>Adicionar fotos</label>
                  <input
                    accept={POLL_IMAGE_ACCEPT}
                    disabled={pendingKey !== null}
                    id={`poll-album-files-${option.id}`}
                    key={`${option.id}:${pendingFiles.length}`}
                    multiple
                    onChange={(event) => {
                      chooseImages(option, Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                    type="file"
                  />
                  <span className="field-help">
                    Restam {remaining} fotos. Até 6 MB por arquivo e 30 MB na votação.
                  </span>
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="poll-album-upload-selection">
                  <div className="poll-image-file-list" aria-label="Novas fotos selecionadas">
                    {pendingFiles.map((file, index) => (
                      <span key={`${file.name}-${file.lastModified}-${index}`}>
                        <span title={file.name}>{file.name}</span>
                        <button
                          aria-label={`Retirar ${file.name} da seleção`}
                          disabled={pendingKey !== null}
                          onClick={() => removeSelected(option.id, index)}
                          type="button"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    className="button secondary"
                    disabled={pendingKey !== null}
                    onClick={() => upload(option)}
                    type="button"
                  >
                    {pendingKey === `upload:${option.id}`
                      ? "Enviando…"
                      : `Adicionar ${pendingFiles.length} foto${pendingFiles.length > 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
              {message?.optionId === option.id && (
                <div className={message.kind} role={message.kind === "error" ? "alert" : "status"}>
                  {message.text}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="field-help">
        Uso atual: {formatFileSize(storedBytes)} de {formatFileSize(MAX_POLL_ALBUM_BYTES)}.
      </p>
    </section>
  );
}
