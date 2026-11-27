import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getSavedTheme, resolveTheme, initializeTheme, setThemePreference, getCurrentThemePreference, nextThemePreference } from '../src/lib/theme';

describe('persisted application theme', () => {
  afterEach(() => {
    setThemePreference('light');
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('restores the saved preference after reinitialization', () => {
    localStorage.setItem('yaqoob-theme', 'dark');
    applyTheme(getSavedTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getSavedTheme()).toBe('dark');
  });

  it('falls back to light mode when no valid preference exists', () => {
    localStorage.setItem('yaqoob-theme', 'invalid');
    applyTheme(getSavedTheme());

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(getSavedTheme()).toBe('light');
  });

  it('falls back safely when browser storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage is unavailable');
    });

    expect(getSavedTheme()).toBe('light');
    applyTheme(getSavedTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    getItem.mockRestore();
  });
  it('resolves system appearance without changing the saved preference', () => {
    const match = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', match);
    localStorage.setItem('yaqoob-theme', 'system');
    expect(getSavedTheme()).toBe('system');
    expect(resolveTheme('system')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('cycles preferences and persists the explicit selection', () => {
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
    expect(nextThemePreference('system')).toBe('light');
    expect(setThemePreference('dark')).toBe(true);
    expect(getSavedTheme()).toBe('dark');
    expect(getCurrentThemePreference()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows OS changes only in system mode', () => {
    let matches = false;
    let onChange: (() => void) | undefined;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return matches; },
      addEventListener: (_event: string, cb: () => void) => { onChange = cb; },
      removeEventListener: vi.fn(),
    })));
    setThemePreference('system');
    const dispose = initializeTheme();
    matches = true;
    onChange?.();
    expect(document.documentElement.dataset.theme).toBe('dark');
    setThemePreference('light');
    onChange?.();
    expect(document.documentElement.dataset.theme).toBe('light');
    dispose();
    vi.unstubAllGlobals();
  });
});
