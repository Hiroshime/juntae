import { describe, expect, it } from "vitest";
import {
  decryptEmailCredential,
  emailEncryptionStatus,
  encryptEmailCredential,
} from "@/server/email/credentials";
import { isPublicSmtpAddress } from "@/server/email/smtp-sender";

describe("credenciais de e-mail", () => {
  const key = Buffer.alloc(32, 7).toString("base64");

  it("criptografa com AES-GCM, autentica a comunidade e usa nonce aleatório", () => {
    const first = encryptEmailCredential("community-a", "segredo-123", key);
    const second = encryptEmailCredential("community-a", "segredo-123", key);
    expect(first).not.toBe(second);
    expect(first).not.toContain("segredo-123");
    expect(decryptEmailCredential("community-a", first, key)).toBe("segredo-123");
    expect(() => decryptEmailCredential("community-b", first, key)).toThrow(
      "Não foi possível ler a credencial",
    );
  });

  it("distingue chave ausente, inválida e válida", () => {
    expect(emailEncryptionStatus("")).toBe("MISSING");
    expect(emailEncryptionStatus("curta")).toBe("INVALID");
    expect(emailEncryptionStatus(key)).toBe("READY");
  });

  it("rejeita destinos SMTP internos, reservados e de documentação", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.8",
      "172.16.0.1",
      "192.168.1.10",
      "169.254.1.1",
      "192.0.2.4",
      "198.51.100.5",
      "203.0.113.9",
      "::1",
      "fd00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:10.0.0.1",
    ])
      expect(isPublicSmtpAddress(address), address).toBe(false);
    expect(isPublicSmtpAddress("8.8.8.8")).toBe(true);
    expect(isPublicSmtpAddress("2607:f8b0:4004:c1b::6d")).toBe(true);
  });
});
