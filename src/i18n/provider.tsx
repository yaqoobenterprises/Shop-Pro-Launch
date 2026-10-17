import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setModuleRegion } from "../regional/region";
import { isFeatureEnabled } from "../config/features";
import { en } from "./en";

export type AppLanguage = "en" | "ur";
export type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;
type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  language: AppLanguage;
  dir: "ltr" | "rtl";
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

function detectDeviceLanguage(): AppLanguage {
  if (typeof navigator === "undefined") return "en";
  const firstLanguage = navigator.languages?.[0] ?? navigator.language;
  return firstLanguage?.toLowerCase().startsWith("ur") ? "ur" : "en";
}

function getInitialLanguage(urduEnabled: boolean): AppLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem("shop-pro:ui-lang");
    if (saved === "en") return "en";
    if (saved === "ur" && urduEnabled) return "ur";
  } catch {
    return urduEnabled ? detectDeviceLanguage() : "en";
  }
  return urduEnabled ? detectDeviceLanguage() : "en";
}

function interpolate(value: string, params?: TranslationParams): string {
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const replacement = params[name];
    return replacement === undefined ? placeholder : String(replacement);
  });
}

const I18nContext = createContext<I18nContextValue>({
  language: "en",
  dir: "ltr",
  setLanguage: () => undefined,
  t: (key) => en[key] ?? String(key),
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const urduEnabled = isFeatureEnabled("languageUr");
  const [language, setLanguageState] = useState<AppLanguage>(() =>
    getInitialLanguage(urduEnabled),
  );
  const [dictionary, setDictionary] = useState<Dictionary>(en);
  const effectiveLanguage = urduEnabled ? language : "en";

  useEffect(() => {
    let active = true;
    if (effectiveLanguage === "en") {
      setDictionary(en);
      return () => {
        active = false;
      };
    }

    void Promise.all([
      import("./ur"),
      import("@fontsource/noto-naskh-arabic/400.css"),
      import("@fontsource/noto-naskh-arabic/700.css"),
    ])
      .then(([translations]) => {
        if (active) setDictionary(translations.ur);
      })
      .catch(() => {
        if (active) {
          setDictionary(en);
          setLanguageState("en");
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveLanguage]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = effectiveLanguage;
    root.dir = effectiveLanguage === "ur" ? "rtl" : "ltr";
    setModuleRegion({ uiLanguage: effectiveLanguage });
    try {
      window.localStorage.setItem("shop-pro:ui-lang", effectiveLanguage);
    } catch {
      // Keep the selected language for this session when browser storage is unavailable.
    }
  }, [effectiveLanguage]);

  const setLanguage = useCallback(
    (nextLanguage: AppLanguage) => {
      if (nextLanguage === "ur" && !urduEnabled) return;
      setLanguageState(nextLanguage);
    },
    [urduEnabled],
  );
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) =>
      interpolate(dictionary[key] ?? en[key] ?? String(key), params),
    [dictionary],
  );
  const contextValue = useMemo<I18nContextValue>(
    () => ({
      language: effectiveLanguage,
      dir: effectiveLanguage === "ur" ? "rtl" : "ltr",
      setLanguage,
      t,
    }),
    [effectiveLanguage, setLanguage, t],
  );

  return React.createElement(I18nContext.Provider, { value: contextValue }, children);
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
