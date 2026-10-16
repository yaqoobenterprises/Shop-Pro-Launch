# Interface design

## Shipped design source

src/index.css is the styling source for the web application. It uses Tailwind CSS v4 utilities, semantic tokens, and application-specific component styles. The design-reference directory is a visual reference scaffold and is not part of the deployed application.

The current interface uses Manrope from the existing local font package. Numeric text uses the system monospace stack. Urdu uses Noto Naskh Arabic, bundled locally and loaded only with the Urdu language chunk. The app does not fetch fonts from Google at runtime.

The light palette is based on ink #14211d, forest #0f5d4b, green #19745c, paper #fbfcfa, and white surfaces. Dark mode updates the same semantic tokens through the saved theme setting. The theme preference key is yaqoob-theme.

## Layout and behavior

The signed-in navigation contains Ledger, Overview, Entries, Reports, Accounts, and Settings. Desktop uses a sidebar; small screens use a fixed bottom navigation with safe-area padding. Screen modules load on demand. Primary pages use shared surface, border, text, and status tokens.

The document direction follows the selected language. Financial values use the num utility to isolate Latin numerals inside right-to-left text. Charts remain left-to-right while surrounding copy follows document direction.

## Change guidance

Reuse the existing tokens and common components. Preserve visible focus outlines, touch targets, and mobile safe areas. Keep financial values in the existing formatting helpers. Visual changes should be compared against design-reference source and checked at mobile, tablet, and desktop sizes in both themes. A connected in-app Browser was unavailable during this audit, so no screenshot-based visual verification is claimed.
