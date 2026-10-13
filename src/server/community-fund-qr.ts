import sharp from "sharp";
import { AppError } from "@/server/errors";

export const MAX_FUND_QR_BYTES = 2 * 1024 * 1024;

export async function prepareCommunityFundQrCode(file: File) {
  if (!file.size || file.size > MAX_FUND_QR_BYTES)
    throw new AppError("O QR Code deve ter entre 1 byte e 2 MB.", 413);
  try {
    const input = new Uint8Array(await file.arrayBuffer());
    const buffer = await sharp(input, { limitInputPixels: 10_000_000, failOn: "warning" })
      .rotate()
      .resize({ width: 1_000, height: 1_000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .timeout({ seconds: 8 })
      .toBuffer();
    return { data: new Uint8Array(buffer), contentType: "image/webp" };
  } catch {
    throw new AppError("Imagem inválida. Envie um QR Code em JPEG, PNG, WebP ou AVIF.");
  }
}
