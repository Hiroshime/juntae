"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_THEME,
  getTheme,
  isThemeId,
  THEMES,
  THEME_STORAGE_KEY,
  type ThemeId,
} from "@/lib/theme";

function applyTheme(themeId: ThemeId) {
  document.documentElement.dataset.theme = themeId;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getTheme(themeId).color);
}

export function ThemeSwitcher() {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const activeTheme = document.documentElement.dataset.theme;
    if (isThemeId(activeTheme)) setThemeId(activeTheme);
  }, []);

  function chooseTheme(nextTheme: ThemeId) {
    setThemeId(nextTheme);
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for this page when storage is unavailable.
    }
    detailsRef.current?.removeAttribute("open");
  }

  const activeTheme = getTheme(themeId);

  return (
    <details className="theme-picker" ref={detailsRef}>
      <summary
        aria-label={`Tema visual: ${activeTheme.label}. Escolher outro tema`}
        title={`Tema: ${activeTheme.label}`}
      >
        <span className="theme-picker-icon" aria-hidden="true" />
      </summary>
      <div className="theme-picker-menu" aria-label="Temas visuais">
        <strong>Tema visual</strong>
        {THEMES.map((theme) => (
          <button
            aria-pressed={theme.id === themeId}
            key={theme.id}
            onClick={() => chooseTheme(theme.id)}
            type="button"
          >
            <span
              className="theme-swatch"
              style={{ "--theme-swatch": theme.color } as CSSProperties}
              aria-hidden="true"
            />
            {theme.label}
            {theme.id === themeId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
