# Theme notes (light / dark)

Architecture is unchanged: single `src/App.tsx`, state-based page switching, global `src/index.css`.

## What was added
- `src/App.tsx`
  - `Theme` type, `ThemeContext`, `useTheme()` and `getInitialTheme()` at the top of the file.
  - `ThemeToggle` button (sun/moon). Used in the landing nav and in `AppShell` header.
  - `App` owns the theme state and sets `<html data-theme="light|dark">` (useLayoutEffect).
  - `Settings` > Appearance now uses `useTheme()` (the old local `dark` preview state was removed).
  - Theme is saved in `localStorage` key `keystone-theme`. First visit follows the system setting.
  - Fixed two TypeScript syntax errors (`Icon` and `ExpenseModal` prop types).
- `src/index.css`
  - All colors now come from CSS variables in `:root` (light) and `:root[data-theme="dark"]` (dark).
  - Light values are identical to the original design.
  - Removed `.settings-page.dark-preview`.
  - Mobile header: workspace badge/name hidden on small screens so the new toggle fits.

## Rules for future changes
- Never hard-code colors in components or CSS. Use a token (`var(--surface)`, `var(--ink)`, `var(--green)` ...).
- New token = add it to BOTH `:root` and `:root[data-theme="dark"]`.
- Use `var(--accent-ink)` for accent text on tinted backgrounds, `var(--forest)` for solid brand fills.
