/**
 * Feature flag definitions and accessors for Shop Pro.
 * All new user-visible features sit behind flags that default to false.
 */

export interface FeatureFlags {
  regionSettings: boolean;
  languageUr: boolean;
  entryModes: boolean;
  chatQueries: boolean;
}

export const FEATURES: FeatureFlags = {
  regionSettings: false,
  languageUr: false,
  entryModes: false,
  chatQueries: false,
};

/**
 * Accessor hook/helper for feature flags.
 * Returns boolean status of the requested feature flag.
 */
export function useFeature(name: keyof FeatureFlags): boolean {
  return FEATURES[name] ?? false;
}
