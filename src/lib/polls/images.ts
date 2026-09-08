export const MAX_POLL_OPTION_IMAGES = 6;
export const MAX_POLL_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_POLL_ALBUM_BYTES = 30 * 1024 * 1024;
export const MAX_POLL_MULTIPART_BYTES = 32 * 1024 * 1024;

export const POLL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export type PollImageContentType =
  "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

export type PollImageUpload = {
  optionIndex: number;
  data: Uint8Array<ArrayBuffer>;
  contentType: PollImageContentType;
  originalName: string;
  sizeBytes: number;
  sortOrder: number;
};

function matches(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function detectPollImageContentType(
  bytes: Uint8Array<ArrayBufferLike>,
): PollImageContentType | null {
  if (matches(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches(bytes, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (
    matches(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matches(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    matches(bytes, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 4) ||
    matches(bytes, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73], 4)
  ) {
    return "image/avif";
  }
  return null;
}

export function safePollImageName(value: string) {
  const name = value
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return (name || "imagem").slice(0, 255);
}

export function validatePollImageUploads(
  uploads: Array<Omit<PollImageUpload, "contentType" | "sortOrder" | "sizeBytes">>,
  optionCount: number,
): PollImageUpload[] {
  const counts = new Map<number, number>();
  let totalBytes = 0;

  return uploads.map((upload) => {
    if (
      !Number.isInteger(upload.optionIndex) ||
      upload.optionIndex < 0 ||
      upload.optionIndex >= optionCount
    ) {
      throw new Error("INVALID_POLL_IMAGE_OPTION");
    }
    const sizeBytes = upload.data.byteLength;
    if (sizeBytes === 0 || sizeBytes > MAX_POLL_IMAGE_BYTES) {
      throw new Error("INVALID_POLL_IMAGE_SIZE");
    }
    totalBytes += sizeBytes;
    if (totalBytes > MAX_POLL_ALBUM_BYTES) throw new Error("POLL_IMAGES_TOO_LARGE");

    const sortOrder = counts.get(upload.optionIndex) ?? 0;
    if (sortOrder >= MAX_POLL_OPTION_IMAGES) throw new Error("TOO_MANY_POLL_IMAGES");
    counts.set(upload.optionIndex, sortOrder + 1);

    const contentType = detectPollImageContentType(upload.data);
    if (!contentType) throw new Error("INVALID_POLL_IMAGE_TYPE");
    return {
      ...upload,
      contentType,
      originalName: safePollImageName(upload.originalName),
      sizeBytes,
      sortOrder,
    };
  });
}
