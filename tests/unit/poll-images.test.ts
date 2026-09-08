import { describe, expect, it } from "vitest";
import {
  detectPollImageContentType,
  MAX_POLL_OPTION_IMAGES,
  safePollImageName,
  validatePollImageUploads,
} from "@/lib/polls/images";

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe("poll option images", () => {
  it("detecta o formato pelos bytes e não confia somente na extensão", () => {
    expect(detectPollImageContentType(png())).toBe("image/png");
    expect(detectPollImageContentType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("image/jpeg");
    expect(detectPollImageContentType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("ordena imagens por opção e sanitiza o nome original", () => {
    const uploads = validatePollImageUploads(
      [
        { optionIndex: 1, originalName: "../foto\u0000.png", data: png() },
        { optionIndex: 1, originalName: "segunda.png", data: png() },
      ],
      2,
    );
    expect(uploads).toMatchObject([
      { optionIndex: 1, originalName: "foto.png", contentType: "image/png", sortOrder: 0 },
      { optionIndex: 1, originalName: "segunda.png", contentType: "image/png", sortOrder: 1 },
    ]);
    expect(safePollImageName("pasta\\imagem.png")).toBe("imagem.png");
  });

  it("limita quantidade e rejeita opção ou conteúdo inválido", () => {
    expect(() =>
      validatePollImageUploads(
        Array.from({ length: MAX_POLL_OPTION_IMAGES + 1 }, (_, index) => ({
          optionIndex: 0,
          originalName: `${index}.png`,
          data: png(),
        })),
        2,
      ),
    ).toThrow("TOO_MANY_POLL_IMAGES");
    expect(() =>
      validatePollImageUploads([{ optionIndex: 2, originalName: "foto.png", data: png() }], 2),
    ).toThrow("INVALID_POLL_IMAGE_OPTION");
    expect(() =>
      validatePollImageUploads(
        [{ optionIndex: 0, originalName: "texto.png", data: new Uint8Array([1, 2, 3]) }],
        2,
      ),
    ).toThrow("INVALID_POLL_IMAGE_TYPE");
  });
});
