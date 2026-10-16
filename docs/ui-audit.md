# UI audit

## Scope and evidence

Source review covered the signed-in layout, route table, global CSS, feature gates, language loading, and command palette. The requested screenshot pass at 360, 768, and 1280 pixels in light/dark and English/Urdu could not be completed: the in-app Browser backend was unavailable, and the Browser skill did not provide a usable session. No visual equivalence claim is made from source inspection alone.

## Findings

| File and area | Severity | Finding and disposition |
| --- | --- | --- |
| src/App.tsx, screen switch | Medium | All signed-in screens were loaded from the root entry. They now load as separate chunks, with an announced loading state. |
| src/components/layout/CommandPalette.tsx, page list | High | Palette targets led to POS, inventory, customer, or expense pages that App.tsx did not render. The palette now searches only the six reachable screens and retains the supported expense and shortcut actions. |
| src/context/AppContext.tsx, AppView | High | The type advertised unavailable screens. The union now contains only screens rendered by the application. |
| src/context/AppContext.tsx and ChatView.tsx, Ctrl+N | Medium | The shortcut pointed to a dead POS screen. It now opens the ledger entry surface and focuses the selected form field. |
| index.html and src/index.css, font setup | Medium | Google Fonts were runtime requests, and Urdu used a font family that was not bundled. External font requests were removed; Manrope is local and Noto Naskh Arabic is loaded with the Urdu chunk. |
| src/App.tsx and settings preference sections | High | New region, language, and entry-mode controls were not consistently gated. Region and preference surfaces now check their respective false-by-default flags; region setup is owner-only. |
| src/components/chat/StandardEntryForm.tsx | High | The current form covers income and expense only and does not yet implement every required ledger type, account/date validation, or the full mode switch contract. The entryModes flag remains false. |
| Signed-in pages and i18n catalogs | High | Several signed-in components still contain English literals. Urdu parity and lazy loading are in place, but full translation coverage and RTL layout verification are not. The languageUr flag remains false. |
| Chat query and chip behavior | High | Read-only question detection and frequency-ranked chips are not implemented. The chatQueries flag remains false. |
| docs/ reference comparison | Medium | The reference scaffold is available for source comparison, but screenshots from the running app could not be captured. A connected Browser pass is still required before claiming exact visual parity. |

## Manual visual verification still required

With a connected in-app Browser, inspect Ledger, Overview, Entries, Reports, Accounts, and Settings at 360, 768, and 1280 pixels in light and dark themes. If Urdu is enabled after its remaining work, repeat in RTL and check numeric isolation, charts, long labels, focus order, touch targets, and modal scrolling.
