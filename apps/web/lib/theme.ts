export const THEMES = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEMES)[number];

export const BAR_COLORS = { light: "#fafaf9", dark: "#0c0a09" };

export function readTheme(cookie: string | undefined): ThemePref {
  return cookie === "light" || cookie === "dark" ? cookie : "system";
}

export function isDark() {
  const forced = document.documentElement.dataset.theme;
  return forced ? forced === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Saves the choice in a cookie so the server renders the next page in it, and repaints this one now. */
export function setTheme(theme: ThemePref) {
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = BAR_COLORS[theme === "system" ? (meta.media.includes("dark") ? "dark" : "light") : theme];
  }
}
