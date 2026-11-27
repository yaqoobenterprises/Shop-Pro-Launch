# Shop Pro / Clarity 1.0

The application uses the user-approved Clarity design system. The live React app retains Supabase authentication, RLS-scoped ledger services, offline work, regional formatting, exports, and LedgerMate.

## Foundation

- Manrope 400, 600 and 700, hosted locally under `public/fonts/`; Noto Naskh Arabic remains available for Urdu.
- Canonical approved colors, spacing, type, radii, control sizes and motion in `src/design-system/tokens.json` and `tokens.css`.
- Semantic cobalt actions; neutral light and graphite-dark surfaces. Income, expense and warning colors retain separate financial meanings.
- Lucide icons use a shared 1.8 stroke. Keep action icons purposeful and amounts tabular.
- Controls are 44px by default, compact controls 36px; cards use 10px corners, inputs/buttons 6px.
- Use short labels and visible financial scope. Keep service limitations, data provenance, errors and recovery instructions explicit.

## Composition

Desktop uses a shared identity/utility header and horizontal navigation. Mobile retains all routes through the bottom dock and More menu. Overview uses a single metric strip, cash-flow panel, category distribution, account balances and other cash movements. Account tools, register filters, reports and settings share the same control hierarchy.

`src/design-system/foundation.css` and `workspace.css` are the current component and screen styling. Existing screen layout contracts are isolated in the lower-priority `legacy` CSS cascade layer; lazy screen chunks no longer inject competing global skins. New work should use the current system files rather than adding another finishing stylesheet.

## Charts

`CashFlowChart` serves Overview and Reports: zero-based rounded bars, bounded monotone lines, signed net results, responsive plot width, pointer/tap selection, keyboard dates and exact-value tables. No artificial minimum bar height changes the displayed ratio.

`CategoryDonut` uses complete 24px exact-share arcs and selectable legends. More than six categories use ranked bars so every category remains available. Empty datasets show an empty state. Unsafe aggregate amounts show an unavailable state. All chart values come from the existing report and ledger calculations.

`manifest.json` pins approved font and token bytes. `role-map.json` documents compatibility names. New geometry and interaction tests complement the existing financial, authorization, offline and export suite.
