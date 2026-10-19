import { AppError } from "@/server/errors";

const uploadErrors: Record<string, { message: string; status?: number }> = {
  INVALID_POLL_IMAGE_OPTION: { message: "Uma foto está vinculada a uma opção inválida." },
  INVALID_POLL_IMAGE_SIZE: { message: "Cada foto deve ter entre 1 byte e 6 MB.", status: 413 },
  POLL_IMAGES_TOO_LARGE: {
    message: "Os álbuns da votação podem ter no máximo 30 MB.",
    status: 413,
  },
  TOO_MANY_POLL_IMAGES: { message: "Cada opção pode ter no máximo 6 fotos." },
  INVALID_POLL_IMAGE_TYPE: {
    message: "Use somente imagens JPEG, PNG, WebP, GIF ou AVIF.",
  },
};

export function throwPollImageUploadError(error: unknown): never {
  const code = error instanceof Error ? error.message : "INVALID_POLL_IMAGE";
  const mapped = uploadErrors[code] ?? { message: "Não foi possível validar as fotos." };
  throw new AppError(mapped.message, mapped.status ?? 400, code);
}
