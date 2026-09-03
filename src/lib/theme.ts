export const THEME_STORAGE_KEY = "juntae_theme";
export const DEFAULT_THEME = "juntae";

export const THEMES = [
  { id: "juntae", label: "Juntaê", color: "#0b6663" },
  { id: "classic", label: "Clássico", color: "#4d35ba" },
  { id: "solar", label: "Solar", color: "#bd4f32" },
  { id: "ocean", label: "Oceano", color: "#1769aa" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value);
}

export function getTheme(themeId: ThemeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}
