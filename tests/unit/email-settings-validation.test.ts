import { describe, expect, it } from "vitest";
import { communityEmailSettingsSchema } from "@/lib/validation/email-settings";

const valid = {
  provider: "GMAIL",
  host: "qualquer.valor",
  port: 587,
  secure: false,
  username: "grupo@gmail.com",
  password: "abcd efgh ijkl mnop",
  fromName: "Grupo",
  fromEmail: "grupo@gmail.com",
  replyTo: "",
  enabled: true,
} as const;

describe("configuração de e-mail", () => {
  it("normaliza o preset Gmail e sua senha de aplicativo", () => {
    expect(communityEmailSettingsSchema.parse(valid)).toMatchObject({
      host: "smtp.gmail.com",
      username: "grupo@gmail.com",
      password: "abcdefghijklmnop",
      replyTo: null,
      inviteEmailsEnabled: true,
      announcementEmailsEnabled: false,
    });
  });

  it("aceita SMTP público por hostname nas portas seguras", () => {
    expect(
      communityEmailSettingsSchema.parse({
        ...valid,
        provider: "CUSTOM_SMTP",
        host: "SMTP.Exemplo.com",
        port: 465,
        secure: true,
      }),
    ).toMatchObject({ host: "smtp.exemplo.com", port: 465, secure: true });
  });

  it("rejeita IP, URL, porta sem TLS adequado e campos extras", () => {
    for (const input of [
      { ...valid, provider: "CUSTOM_SMTP", host: "127.0.0.1" },
      { ...valid, provider: "CUSTOM_SMTP", host: "https://smtp.exemplo.com" },
      { ...valid, port: 465, secure: false },
      { ...valid, port: 587, secure: true },
      { ...valid, unexpected: true },
    ])
      expect(communityEmailSettingsSchema.safeParse(input).success).toBe(false);
  });
});
