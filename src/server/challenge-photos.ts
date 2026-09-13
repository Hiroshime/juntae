import sharp from "sharp";
import { MAX_ACTIVITY_PHOTOS, MAX_ACTIVITY_PHOTO_BYTES } from "@/lib/challenge-activities";
import { AppError } from "@/server/errors";

export async function prepareChallengePhotos(photos: Uint8Array<ArrayBuffer>[]) {
  if (photos.length > MAX_ACTIVITY_PHOTOS)
    throw new AppError("Envie no máximo 3 fotos por treino.");
  const result: Uint8Array<ArrayBuffer>[] = [];
  // Decode sequentially with pixel/time limits; re-encode without EXIF/GPS metadata.
  for (const photo of photos) {
    if (!photo.byteLength || photo.byteLength > MAX_ACTIVITY_PHOTO_BYTES)
      throw new AppError("Cada foto deve ter entre 1 byte e 6 MB.", 413);
    try {
      const pipeline = sharp(photo, { limitInputPixels: 40_000_000, failOn: "warning" });
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
      if (buffer.byteLength > MAX_ACTIVITY_PHOTO_BYTES) throw new Error("Output too large");
      result.push(new Uint8Array(buffer));
    } catch {
      throw new AppError("Foto inválida. Use JPEG, PNG, WebP, GIF ou AVIF com até 40 megapixels.");
    }
  }
  return result;
}
