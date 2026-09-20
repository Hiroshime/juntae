import { describe, expect, it } from "vitest";
import { socialPostSchema } from "@/lib/validation/social";

describe("validação de comunicados por e-mail", () => {
  it("aceita comunicado formatado com disparo opcional", () => {
    expect(
      socialPostSchema.parse({
        kind: "ANNOUNCEMENT",
        contentFormat: "MARKDOWN",
        content: "## Nova função",
        sendEmail: true,
        emailSubject: "Novidade no Juntaê",
      }),
    ).toMatchObject({ sendEmail: true, contentFormat: "MARKDOWN" });
  });

  it("impede que publicação comum solicite formatação ou e-mail", () => {
    expect(
      socialPostSchema.safeParse({
        kind: "POST",
        contentFormat: "MARKDOWN",
        content: "Mensagem",
        sendEmail: true,
      }).success,
    ).toBe(false);
  });

  it("exige texto para disparar comunicado por e-mail", () => {
    expect(
      socialPostSchema.safeParse({
        kind: "ANNOUNCEMENT",
        contentFormat: "MARKDOWN",
        content: "",
        sendEmail: true,
      }).success,
    ).toBe(false);
  });
});
