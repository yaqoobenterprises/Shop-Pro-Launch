export type AppTheme = "light" | "dark";
export type ThemePreference = AppTheme;

export function getSavedTheme(): AppTheme {
  try {
    return localStorage.getItem("yaqoob-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("yaqoob-theme", theme); } catch { /* Session appearance still works. */ }
  window.dispatchEvent(new CustomEvent("shop-pro:theme-change", { detail: theme }));
}
