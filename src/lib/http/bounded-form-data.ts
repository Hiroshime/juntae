import { AppError } from "@/server/errors";

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data"))
    throw new AppError("Envie os dados como formulário com arquivos.", 415);
  const tooLarge = () =>
    new AppError(
      `O envio completo pode ter no máximo ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      413,
      "PAYLOAD_TOO_LARGE",
    );
  if (Number(request.headers.get("content-length")) > maxBytes) throw tooLarge();
  if (!request.body) throw new AppError("Formulário vazio.");
  const reader = request.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new AppError("Formulário inválido.");
  }
}
