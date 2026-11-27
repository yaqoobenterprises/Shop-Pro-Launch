/**
 * Feature flag definitions and accessors for Shop Pro.
 * Feature flags control availability of staged Shop Pro features.
 */

export interface FeatureFlags {
  regionSettings: boolean;
  languageUr: boolean;
  entryModes: boolean;
  chatQueries: boolean;
  /** Enable only after submitted-action recovery and authorization are verified. */
  reviewedLedgerActions: boolean;
}

export const FEATURES: FeatureFlags = {
  regionSettings: false,
  languageUr: false,
  entryModes: false,
  chatQueries: true,
  reviewedLedgerActions: false,
};

/**
 * Accessor hook/helper for feature flags.
 * Returns boolean status of the requested feature flag.
 */
export function isFeatureEnabled(name: keyof FeatureFlags): boolean {
  return FEATURES[name] ?? false;
}
