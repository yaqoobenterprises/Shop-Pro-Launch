import { useEffect, useState } from "react";
import { applyTheme, getSavedTheme, type AppTheme } from "../lib/theme";

/** Header, public pages and Settings always reflect the same saved appearance. */
export function useTheme() {
  const [theme, setTheme] = useState<AppTheme>(() => getSavedTheme());
  useEffect(() => {
    const update = () => setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    const fromStorage = (event: StorageEvent) => {
      if (event.key === "yaqoob-theme" || event.key === null) applyTheme(getSavedTheme());
    };
    window.addEventListener("shop-pro:theme-change", update);
    window.addEventListener("storage", fromStorage);
    return () => {
      window.removeEventListener("shop-pro:theme-change", update);
      window.removeEventListener("storage", fromStorage);
    };
  }, []);
  return [theme, applyTheme] as const;
}
