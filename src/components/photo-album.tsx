"use client";

import { useEffect, useRef, useState } from "react";

export function PhotoAlbum({
  photos,
  title,
}: {
  photos: { id: string; url: string }[];
  title: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (index === null) return;
    const node = dialog.current;
    if (!node?.open) node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [index]);
  const change = (delta: number) =>
    setIndex((current) =>
      current === null ? null : (current + delta + photos.length) % photos.length,
    );
  if (!photos.length) return null;
  return (
    <div className="activity-album">
      <div className="activity-photo-grid" role="group" aria-label={`Fotos de ${title}`}>
        {photos.map((photo, photoIndex) => (
          <button
            className="activity-photo-button"
            type="button"
            key={photo.id}
            aria-label={`Ampliar foto ${photoIndex + 1} de ${title}`}
            onClick={() => setIndex(photoIndex)}
          >
            {/* Private images must bypass the public image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={`Foto ${photoIndex + 1} de ${title}`} loading="lazy" />
            <span aria-hidden="true">⛶</span>
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="activity-lightbox"
        aria-label={`Fotos de ${title}`}
        onClose={() => setIndex(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") change(1);
          if (event.key === "ArrowLeft") change(-1);
        }}
      >
        {index !== null && (
          <>
            <div className="activity-lightbox-toolbar">
              <span>
                {index + 1} de {photos.length}
              </span>
              <button type="button" autoFocus onClick={() => dialog.current?.close()}>
                Fechar foto
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[index].url} alt={`Foto ${index + 1} de ${title} ampliada`} />
            {photos.length > 1 && (
              <div className="activity-lightbox-toolbar">
                <button type="button" onClick={() => change(-1)}>
                  Foto anterior
                </button>
                <button type="button" onClick={() => change(1)}>
                  Próxima foto
                </button>
              </div>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}
