import { useSyncExternalStore } from "react";
import { getCurrentThemePreference, subscribeThemePreference, type ThemePreference } from "./theme";

const getServerPreference = (): ThemePreference => "light";

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeThemePreference, getCurrentThemePreference, getServerPreference);
}
