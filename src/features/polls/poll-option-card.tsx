"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RichPollOption = {
  label: string;
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  location: string | null;
  images: Array<{ id: string; url: string }>;
};

export function PollOptionContent({ option }: { option: RichPollOption }) {
  const images = [
    ...option.images.map((image) => ({ key: image.id, url: image.url })),
    ...(option.imageUrl ? [{ key: `external-${option.imageUrl}`, url: option.imageUrl }] : []),
  ];
  const [activeImage, setActiveImage] = useState<number | null>(null);
  const imageButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const lightbox = useRef<HTMLDivElement | null>(null);

  const closeAlbum = useCallback(() => {
    const previousIndex = activeImage;
    setActiveImage(null);
    if (previousIndex != null) {
      window.setTimeout(() => imageButtons.current[previousIndex]?.focus(), 0);
    }
  }, [activeImage]);

  const showRelativeImage = useCallback(
    (offset: number) => {
      setActiveImage((current) =>
        current == null ? 0 : (current + offset + images.length) % images.length,
      );
    },
    [images.length],
  );

  useEffect(() => {
    if (activeImage == null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAlbum();
      if (event.key === "ArrowRight" && images.length > 1) showRelativeImage(1);
      if (event.key === "ArrowLeft" && images.length > 1) showRelativeImage(-1);
      if (event.key === "Tab") {
        const controls = Array.from(
          lightbox.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [],
        );
        const firstControl = controls.at(0);
        const lastControl = controls.at(-1);
        if (event.shiftKey && document.activeElement === firstControl) {
          event.preventDefault();
          lastControl?.focus();
        } else if (!event.shiftKey && document.activeElement === lastControl) {
          event.preventDefault();
          firstControl?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImage, closeAlbum, images.length, showRelativeImage]);

  return (
    <div className="poll-option-content">
      {images.length > 0 && (
        <div aria-label={`Álbum de ${option.label}`} className="poll-option-album" role="group">
          <div className="poll-option-album-track">
            {images.map((image, index) => (
              <button
                aria-label={`Ampliar foto ${index + 1} de ${option.label}`}
                className="poll-album-image-button"
                key={image.key}
                onClick={() => setActiveImage(index)}
                ref={(node) => {
                  imageButtons.current[index] = node;
                }}
                type="button"
              >
                {/* Uploaded images use authenticated same-origin URLs; external URLs remain supported. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`Foto ${index + 1} de ${option.label}`}
                  decoding="async"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={image.url}
                />
                <span className="poll-image-expand-hint" aria-hidden="true">
                  ⛶
                </span>
              </button>
            ))}
          </div>
          {images.length > 1 && <span className="poll-album-count">{images.length} fotos</span>}
        </div>
      )}
      {activeImage != null && (
        <div
          className="poll-lightbox-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeAlbum();
          }}
        >
          <div
            aria-label={`Foto ${activeImage + 1} de ${option.label}`}
            aria-modal="true"
            className="poll-lightbox"
            ref={lightbox}
            role="dialog"
          >
            <div className="poll-lightbox-toolbar">
              <span>
                {activeImage + 1} de {images.length}
              </span>
              <button autoFocus onClick={closeAlbum} type="button">
                Fechar ×
              </button>
            </div>
            <div className="poll-lightbox-stage">
              {images.length > 1 && (
                <button
                  aria-label="Foto anterior"
                  className="poll-lightbox-navigation previous"
                  onClick={() => showRelativeImage(-1)}
                  type="button"
                >
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={`Foto ${activeImage + 1} de ${option.label} ampliada`}
                decoding="async"
                referrerPolicy="no-referrer"
                src={images[activeImage].url}
              />
              {images.length > 1 && (
                <button
                  aria-label="Próxima foto"
                  className="poll-lightbox-navigation next"
                  onClick={() => showRelativeImage(1)}
                  type="button"
                >
                  ›
                </button>
              )}
            </div>
            <strong>{option.label}</strong>
          </div>
        </div>
      )}
      <div className="poll-option-copy">
        <strong>{option.label}</strong>
        {option.description && <p>{option.description}</p>}
        {option.location && <small>📍 {option.location}</small>}
      </div>
    </div>
  );
}

export function PollOptionLinks({ option }: { option: RichPollOption }) {
  if (!option.websiteUrl) return null;
  return (
    <div className="poll-option-links">
      <a href={option.websiteUrl} rel="noopener noreferrer" target="_blank">
        Abrir página ↗
      </a>
    </div>
  );
}
