/**
 * Feature flag definitions and accessors for Shop Pro.
 * Feature flags control availability of staged Shop Pro features.
 */

export interface FeatureFlags {
  regionSettings: boolean;
  companySetupWizard: boolean;
  languageUr: boolean;
  entryModes: boolean;
  chatQueries: boolean;
}

export const FEATURES: FeatureFlags = {
  regionSettings: false,
  // Preview-only opt-in. Never active on production without an explicit build setting.
  companySetupWizard: import.meta.env?.VITE_ENABLE_COMPANY_SETUP_WIZARD === 'true',
  languageUr: false,
  entryModes: false,
  chatQueries: true,
};

/**
 * Accessor hook/helper for feature flags.
 * Returns boolean status of the requested feature flag.
 */
export function isFeatureEnabled(name: keyof FeatureFlags): boolean {
  return FEATURES[name] ?? false;
}
