import { describe, expect, it } from "vitest";
import { parseRichText, richTextToHtml, richTextToPlainText } from "@/lib/rich-text";

describe("formatação segura de comunicados", () => {
  it("converte títulos, ênfase, listas e links HTTPS", () => {
    const content =
      "# Novidade\n\nAgora temos **e-mail**.\n\n- Convites\n- Comunicados\n\n[Abra o Juntaê](https://juntae.example/app)";
    const html = richTextToHtml(content);
    expect(html).toContain("<h1>Novidade</h1>");
    expect(html).toContain("<strong>e-mail</strong>");
    expect(html).toContain("<ul><li>Convites</li><li>Comunicados</li></ul>");
    expect(html).toContain('href="https://juntae.example/app"');
    expect(richTextToPlainText(content)).toContain("- Convites\n- Comunicados");
  });

  it("escapa HTML bruto e não transforma protocolos perigosos em links", () => {
    const content = "<script>alert(1)</script> [clique](javascript:alert(1))";
    const html = richTextToHtml(content);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=");
  });

  it("mantém blocos previsíveis para renderização no feed", () => {
    expect(parseRichText("## Título\n\n1. Um\n2. Dois")).toMatchObject([
      { type: "heading", level: 2 },
      { type: "list", ordered: true, items: [[{ value: "Um" }], [{ value: "Dois" }]] },
    ]);
  });
});
