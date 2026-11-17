# Interface design

## Design foundation

The shipped styling source is `src/index.css`, using Tailwind CSS v4 utilities, semantic CSS variables, and application-specific component styles.

The visual direction is a restrained financial workspace:
- **Brand:** deep navy `#172638` and emerald `#14765E`.
- **Canvas:** soft cool grey `#F5F7F8` with white content surfaces.
- **Typography:** locally bundled Inter Variable for the interface.
- **Financial figures:** tabular numerals; the shared `--font-mono` token uses the system monospace stack for utility contexts.
- **Icons:** Lucide outline icons with a shared stroke weight.
- **Shape and elevation:** shared radius and shadow tokens, with subtle borders and restrained shadows.

Light and dark themes use the same semantic tokens. Dark mode uses deep navy surfaces and softened emerald accents. The saved theme preference key is `yaqoob-theme`.

## Layout and behavior

The signed-in navigation contains Ledger, Overview, Entries, Reports, Accounts, and Settings. Desktop uses a sidebar; small screens use a fixed bottom navigation with safe-area padding. Screen modules load on demand.

Pages should reuse semantic surface, border, text, status, radius, focus, and elevation tokens rather than introducing one-off colours or arbitrary shadows. Lucide icons should remain outline-based and use the shared icon stroke token.

The document direction follows the selected language. Financial values use the `num` utility to isolate Latin numerals inside right-to-left text. Charts remain left-to-right while surrounding copy follows document direction.

## Accessibility and responsive behavior

Preserve visible keyboard focus indicators, sufficient text contrast, touch targets, and mobile safe areas. Form controls use the shared emerald focus ring. Respect reduced-motion preferences and validate layouts at desktop and narrow widths in both themes.

## Change guidance

Treat this file as the design-system reference. When changing the visual language, update the semantic tokens first, then refine shared components before applying screen-specific styling. Keep financial values in the existing formatting helpers. Do not alter ledger, authentication, database, or offline-sync behavior as part of visual-only work.
