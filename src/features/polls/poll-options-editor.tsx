"use client";
import {
  MAX_POLL_ALBUM_BYTES,
  MAX_POLL_IMAGE_BYTES,
  MAX_POLL_OPTION_IMAGES,
  POLL_IMAGE_ACCEPT,
} from "@/lib/polls/images";
export type DraftOption = {
  label: string;
  description: string;
  imageUrl: string;
  websiteUrl: string;
  location: string;
  images: File[];
};

type DraftOptionTextField = Exclude<keyof DraftOption, "images">;

export const emptyOption = (): DraftOption => ({
  label: "",
  description: "",
  imageUrl: "",
  websiteUrl: "",
  location: "",
  images: [],
});

export function PollOptionsEditor({
  options,
  onChange,
  albumBytes,
  setError,
  idPrefix = "poll",
}: {
  options: DraftOption[];
  onChange: (options: DraftOption[]) => void;
  albumBytes: number;
  setError: (message: string | null) => void;
  idPrefix?: string;
}) {
  function updateOption(index: number, field: DraftOptionTextField, value: string) {
    onChange(options.map((option, i) => (i === index ? { ...option, [field]: value } : option)));
  }
  function addOptionImages(index: number, selected: File[]) {
    const images = [...options[index].images, ...selected];
    if (images.length > MAX_POLL_OPTION_IMAGES) {
      setError(`Cada opção pode ter no máximo ${MAX_POLL_OPTION_IMAGES} fotos.`);
      return;
    }
    if (selected.some((file) => file.size === 0 || file.size > MAX_POLL_IMAGE_BYTES)) {
      setError("Cada foto deve ter entre 1 byte e 6 MB.");
      return;
    }
    if (albumBytes + selected.reduce((sum, file) => sum + file.size, 0) > MAX_POLL_ALBUM_BYTES) {
      setError("Os álbuns da votação podem ter no máximo 30 MB no total.");
      return;
    }
    setError(null);
    onChange(options.map((option, i) => (i === index ? { ...option, images } : option)));
  }
  function removeOptionImage(index: number, imageIndex: number) {
    onChange(
      options.map((option, i) =>
        i === index
          ? { ...option, images: option.images.filter((_, n) => n !== imageIndex) }
          : option,
      ),
    );
  }

  return (
    <fieldset className="poll-options-fieldset">
      <legend>Opções</legend>
      <div className="poll-option-editors">
        {options.map((option, index) => (
          <div className="poll-option-editor" key={index}>
            <div className="option-editor-row">
              <div className="field">
                <label htmlFor={`${idPrefix}-option-${index}`}>Opção {index + 1}</label>
                <input
                  id={`${idPrefix}-option-${index}`}
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
                  onClick={() => onChange(options.filter((_, itemIndex) => itemIndex !== index))}
                  type="button"
                >
                  Remover
                </button>
              )}
            </div>
            <details className="poll-option-details">
              <summary>Adicionar álbum, descrição, página ou local</summary>
              <div className="field">
                <label htmlFor={`${idPrefix}-option-images-${index}`}>Fotos do álbum</label>
                <input
                  accept={POLL_IMAGE_ACCEPT}
                  id={`${idPrefix}-option-images-${index}`}
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
                <label htmlFor={`${idPrefix}-option-description-${index}`}>
                  Descrição da opção
                </label>
                <textarea
                  id={`${idPrefix}-option-description-${index}`}
                  maxLength={1500}
                  onChange={(event) => updateOption(index, "description", event.target.value)}
                  rows={3}
                  value={option.description}
                />
              </div>
              <div className="form-row">
                <div className="field">
                  <label htmlFor={`${idPrefix}-option-image-${index}`}>URL de foto externa</label>
                  <input
                    id={`${idPrefix}-option-image-${index}`}
                    maxLength={2000}
                    onChange={(event) => updateOption(index, "imageUrl", event.target.value)}
                    placeholder="https://"
                    type="url"
                    value={option.imageUrl}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${idPrefix}-option-website-${index}`}>Página web</label>
                  <input
                    id={`${idPrefix}-option-website-${index}`}
                    maxLength={2000}
                    onChange={(event) => updateOption(index, "websiteUrl", event.target.value)}
                    placeholder="https://"
                    type="url"
                    value={option.websiteUrl}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-option-location-${index}`}>Local ou endereço</label>
                <input
                  id={`${idPrefix}-option-location-${index}`}
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
          onClick={() => onChange([...options, emptyOption()])}
          type="button"
        >
          Adicionar opção
        </button>
      )}
    </fieldset>
  );
}
