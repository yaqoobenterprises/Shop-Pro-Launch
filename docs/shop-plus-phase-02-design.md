# Shop Plus / Ledger Ink — Phase 02 design foundation

## Design direction
Neutral graphite rather than colored canvas, restrained indigo brand, separate semantic green for income/positive status and rose for danger. The original C/plus mark is a local vector asset, distinct from existing third-party bank logos. Keep Inter Variable locally bundled; tabular figures and bidirectional number isolation remain. Do not copy competitor chrome.

## Source of truth
- `src/styles/tokens.css`: light/dark palette, semantic aliases, surfaces, focus, radii, elevation, spacing, motion and layer tokens. The old global and signed-in palette blocks were consolidated; compatibility names such as forest/mint remain aliases. Existing feature-specific hard-coded CSS needs staged review rather than blind deletion.
- `src/typography.css`: established typography scale and layout-specific typography. Keep body text readable; don't use color alone to communicate financial status.
- `src/lib/theme.ts` and `useThemePreference.ts`: persisted light/dark/system, same legacy preference key `yaqoob-theme`, shared state across landing/header/settings, system changes and cross-tab storage updates. Existing default stays light; no account or data migration. Header/landing cycle preferences; Settings offers three explicit choices.
- `public/assets/shop-plus-mark.svg`: new mark used in the public, auth, sidebar and browser/favicon flows; legacy raster installed-app icons remain for compatibility until separately regenerated and tested.
- `src/components/common`: Button, Input, Card, Badge, Modal, Select, DatePicker, MonthPicker, ToastContainer and amount display refined without dependencies. Prefer these over bespoke controls. Use explicit labels for icon-only buttons, correct roles and disabled/busy states; require clear text labels in addition to status color.

## Financial and interaction safeguards
AnimatedAmount retains its API but renders exact safe integer minor units directly; loading, unavailable and zero are distinct. No change to calculation or formatting contracts. The shared Modal has a labeled title/description, initial close-button focus, keyboard focus containment and restoration, Escape handling, and inner popup containment for existing portal-based date and select controls. Native browser/manual checks remain necessary; other bespoke dialogs are not covered by this shared component. No production mutations, dependency additions, auth changes, service-worker cache migration, or schema changes.

## Acceptance checks
- Unit regression: existing tests plus added theme persistence/system, exact amounts, shared modal focus and select-in-dialog, and core token color-contrast checks. Static contrast checks do not certify rendered UI.
- Browser baseline: 64 original demo views passed geometry and page-error checks (run 45954045248). Candidate browser workflow captures light and dark screenshots for the same widths; no live data access.
- Preserve current ledger fixtures, posted-versus-queued status, feature flags, existing storage keys and route contracts. Keep draft PR until all required checks are reviewed.
- Screen-specific layouts, full control gallery, native mobile touch/zoom and screen-reader testing, real-user performance, and production security validation remain open.

## Phase 02 automated verification result

Candidate `66810cb4c7a221dc1fe9dce28b28ae25b843e3b6`: [CI](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954730040) passed all steps: 61 files, 379 tests, build, type checks, lint, dependency audit and size guards. [Browser audit](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954730166) passed in both themes across eight widths and all eight demo surfaces. [Dark artifact](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954730166/artifacts/15177629574), [light artifact](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954730166/artifacts/15178605854). No manual visual or assistive technology conformance claim; release gates remain.
