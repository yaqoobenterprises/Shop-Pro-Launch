import { describe, it, expect } from 'vitest';
import { FEATURES, isFeatureEnabled, FeatureFlags } from '../src/config/features';

describe('Feature Flags Configuration', () => {
  const expectedFlags: (keyof FeatureFlags)[] = [
    'regionSettings',
    'languageUr',
    'entryModes',
    'chatQueries',
    'reviewedLedgerActions',
  ];

  const expectedState: Record<keyof FeatureFlags, boolean> = {
    regionSettings: false,
    languageUr: false,
    entryModes: false,
    chatQueries: true,
    reviewedLedgerActions: false,
  };

  it('declares all expected feature flags with the intended release state', () => {
    for (const flag of expectedFlags) {
      expect(flag in FEATURES).toBe(true);
      expect(FEATURES[flag]).toBe(expectedState[flag]);
    }
  });

  it('exposes isFeatureEnabled helper with the configured state for each flag', () => {
    for (const flag of expectedFlags) {
      expect(isFeatureEnabled(flag)).toBe(expectedState[flag]);
    }
  });

  it('contains exactly the 5 reviewed feature flags and no unauthorized extra flags', () => {
    const keys = Object.keys(FEATURES) as (keyof FeatureFlags)[];
    expect(keys.sort()).toEqual(expectedFlags.slice().sort());
  });
});
