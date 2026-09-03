import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getTheme, isThemeId, THEMES } from "@/lib/theme";

describe("themes", () => {
  it("oferece quatro temas com identificadores e cores únicos", () => {
    expect(THEMES).toHaveLength(4);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(4);
    expect(new Set(THEMES.map((theme) => theme.color)).size).toBe(4);
  });

  it("aceita somente identificadores conhecidos", () => {
    expect(isThemeId("classic")).toBe(true);
    expect(isThemeId("desconhecido")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("mantém o Juntaê como tema padrão", () => {
    expect(getTheme(DEFAULT_THEME).label).toBe("Juntaê");
  });
});
