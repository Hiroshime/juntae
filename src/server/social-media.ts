import sharp from "sharp";
import { MAX_SOCIAL_IMAGE_BYTES, MAX_SOCIAL_MEDIA, MAX_SOCIAL_VIDEO_BYTES } from "@/lib/social";
import { AppError } from "@/server/errors";

export type RawSocialMedia = {
  bytes: Uint8Array<ArrayBuffer>;
  name: string;
  declaredType: string;
};

export type PreparedSocialMedia = {
  data: Uint8Array<ArrayBuffer>;
  originalName: string;
  contentType: string;
  kind: "IMAGE" | "VIDEO";
  sizeBytes: number;
};

function safeName(name: string, fallback: string) {
  const sanitized = name
    .replace(/[\\/\u0000-\u001f\u007f]/g, "-")
    .trim()
    .slice(0, 240);
  return sanitized || fallback;
}

function videoType(bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.byteLength >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp")
    return "video/mp4";
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm";
  return null;
}

async function prepareImage(file: RawSocialMedia): Promise<PreparedSocialMedia> {
  if (!file.bytes.byteLength || file.bytes.byteLength > MAX_SOCIAL_IMAGE_BYTES)
    throw new AppError("Cada imagem deve ter entre 1 byte e 6 MB.", 413);
  try {
    const pipeline = sharp(file.bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await pipeline.metadata();
    if (!["jpeg", "png", "webp", "gif", "heif"].includes(metadata.format ?? ""))
      throw new Error("Unsupported image");
    if (metadata.format === "heif" && metadata.compression !== "av1")
      throw new Error("Only AVIF supported");
    const buffer = await pipeline
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .timeout({ seconds: 10 })
      .toBuffer();
    if (buffer.byteLength > MAX_SOCIAL_IMAGE_BYTES) throw new Error("Output too large");
    const data = new Uint8Array(buffer);
    return {
      data,
      originalName: safeName(file.name, "imagem.webp"),
      contentType: "image/webp",
      kind: "IMAGE",
      sizeBytes: data.byteLength,
    };
  } catch {
    throw new AppError("Imagem inválida. Use JPEG, PNG, WebP, GIF ou AVIF com até 40 megapixels.");
  }
}

function prepareVideo(file: RawSocialMedia): PreparedSocialMedia {
  if (!file.bytes.byteLength || file.bytes.byteLength > MAX_SOCIAL_VIDEO_BYTES)
    throw new AppError("Cada vídeo deve ter entre 1 byte e 25 MB.", 413);
  const contentType = videoType(file.bytes);
  if (!contentType) throw new AppError("Vídeo inválido. Use MP4 ou WebM.");
  return {
    data: file.bytes,
    originalName: safeName(file.name, contentType === "video/mp4" ? "video.mp4" : "video.webm"),
    contentType,
    kind: "VIDEO",
    sizeBytes: file.bytes.byteLength,
  };
}

export async function prepareSocialMedia(files: RawSocialMedia[]) {
  if (files.length > MAX_SOCIAL_MEDIA)
    throw new AppError(`Envie no máximo ${MAX_SOCIAL_MEDIA} anexos por publicação.`);
  const result: PreparedSocialMedia[] = [];
  for (const file of files) {
    if (file.declaredType.startsWith("image/")) result.push(await prepareImage(file));
    else if (file.declaredType.startsWith("video/")) result.push(prepareVideo(file));
    else throw new AppError("Anexo inválido. Envie uma imagem, MP4 ou WebM.");
  }
  return result;
}
