import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/server/errors";

const VERSION = "v1";
const IV_BYTES = 12;

export type EmailEncryptionStatus = "READY" | "MISSING" | "INVALID";

function configuredValue(value?: string) {
  return value ?? process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY;
}

export function decodeEmailEncryptionKey(value?: string) {
  const configured = configuredValue(value);
  if (!configured)
    throw new AppError("Configure a chave de criptografia de e-mail no servidor.", 503);
  const key = Buffer.from(configured, "base64");
  if (key.byteLength !== 32)
    throw new AppError("A chave de criptografia de e-mail configurada é inválida.", 503);
  return key;
}

export function emailEncryptionStatus(value?: string): EmailEncryptionStatus {
  const configured = configuredValue(value);
  if (!configured) return "MISSING";
  try {
    return decodeEmailEncryptionKey(configured).byteLength === 32 ? "READY" : "INVALID";
  } catch {
    return "INVALID";
  }
}

function associatedData(communityId: string) {
  return Buffer.from(`juntae:community:${communityId}:smtp`, "utf8");
}

export function encryptEmailCredential(communityId: string, plaintext: string, keyValue?: string) {
  const key = decodeEmailEncryptionKey(keyValue);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData(communityId));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptEmailCredential(communityId: string, payload: string, keyValue?: string) {
  try {
    const key = decodeEmailEncryptionKey(keyValue);
    const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = payload.split(".");
    if (version !== VERSION || !encodedIv || !encodedTag || !encodedCiphertext || extra.length)
      throw new Error("Invalid payload");
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (iv.byteLength !== IV_BYTES || tag.byteLength !== 16) throw new Error("Invalid payload");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(associatedData(communityId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Não foi possível ler a credencial de e-mail. Confira a chave de criptografia do servidor.",
      500,
      "EMAIL_CREDENTIAL_UNREADABLE",
    );
  }
}
