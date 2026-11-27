export type AppTheme = "light" | "dark";
export type ThemePreference = AppTheme | "system";

const STORAGE_KEY = "yaqoob-theme";
const THEME_EVENT = "shop-plus:theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";
let sessionPreference: ThemePreference | undefined;

export function getSavedTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "dark" || saved === "system" ? saved : "light";
  } catch {
    return "light";
  }
}

export function getCurrentThemePreference(): ThemePreference {
  return sessionPreference ?? getSavedTheme();
}

export function resolveTheme(preference: ThemePreference): AppTheme {
  if (preference !== "system") return preference;
  return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches
    ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): void {
  const theme = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function setThemePreference(preference: ThemePreference): boolean {
  sessionPreference = preference;
  let persisted = true;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    persisted = false;
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_EVENT));
  return persisted;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return preference === "light" ? "dark" : preference === "dark" ? "system" : "light";
}

export function subscribeThemePreference(listener: () => void): () => void {
  window.addEventListener(THEME_EVENT, listener);
  return () => window.removeEventListener(THEME_EVENT, listener);
}

export function initializeTheme(): () => void {
  applyTheme(getCurrentThemePreference());
  const media = window.matchMedia?.(DARK_QUERY);
  const handleSystemChange = () => {
    if (getCurrentThemePreference() === "system") applyTheme("system");
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sessionPreference = getSavedTheme();
    applyTheme(sessionPreference);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  media?.addEventListener?.("change", handleSystemChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    media?.removeEventListener?.("change", handleSystemChange);
    window.removeEventListener("storage", handleStorage);
  };
}
