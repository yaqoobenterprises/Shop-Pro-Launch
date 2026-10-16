import { describe, it, expect } from 'vitest';
import { FEATURES, useFeature, FeatureFlags } from '../src/config/features';

describe('Feature Flags Configuration', () => {
  const expectedFlags: (keyof FeatureFlags)[] = [
    'regionSettings',
    'languageUr',
    'entryModes',
    'chatQueries',
  ];

  it('declares all expected feature flags with default value false', () => {
    for (const flag of expectedFlags) {
      expect(flag in FEATURES).toBe(true);
      expect(FEATURES[flag]).toBe(false);
    }
  });

  it('exposes useFeature helper which returns false for each flag', () => {
    for (const flag of expectedFlags) {
      expect(useFeature(flag)).toBe(false);
    }
  });

  it('contains exactly the 4 required feature flags and no unauthorized extra flags', () => {
    const keys = Object.keys(FEATURES) as (keyof FeatureFlags)[];
    expect(keys.sort()).toEqual(expectedFlags.slice().sort());
  });
});
