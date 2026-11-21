# AQVORA workspace visual system

## Reference and design contract

The approved signed-in workspace reference is the pastel financial dashboard screenshot shared on 20 November 2026. Use its **soft lavender-grey canvas and sidebar, charcoal/mint/blush/white KPI row, white chart surfaces and purple/teal/pink charts**, without copying its unrelated product, order metrics, placeholder statistics or navigation.

The approved AQVORA symbol is the user-provided navy A with emerald wave; the preview includes an SVG contour trace of that reference. Confirm final vector fidelity and trademark clearance before publicly replacing the existing brand assets. The logo stays navy/emerald; functional chart accents can be pastel.

### Light mode tokens
| Meaning | Token | Value |
| --- | --- | --- |
| Workspace background/sidebar | `--soft` / `--paper` | `#E7E6EB` |
| Primary panel | `--surface-card` | `#FFFFFF` |
| Featured card | `--featured` | `#4D4B4C` |
| Mint KPI | local semantic card accent | `#ECFFFD` |
| Blush KPI | local semantic card accent | `#FEEAF5` |
| Income chart | `--chart-lavender` | `#9189DF` |
| Expenses chart | `--chart-teal` | `#55CDBB` |
| Category segment | `--chart-pink` | `#F58FCC` |
| Text | `--ink` / `--ink-2` | charcoal with readable contrast |

The scoped source of truth is `src/components/layout/WorkspacePastel.css`. `src/components/dashboard/OverviewReference.css` defines KPI and chart layout but consumes shared chart tokens. The entire `.app-shell` inherits those tokens; public landing/auth retain separate branding until their own flow is reviewed. Dark mode uses a properly designed slate/lavender contrast palette in the same shared file, with no second theme preference.

## Actual implementation in this UI PR

- `Sidebar.tsx` retains collapse, resize, real existing navigation IDs, profile and permissions; presentation is light/minimal like reference. Do not invent POS, Payroll or Purchase actions just for visual parity.
- `Header.tsx` keeps command search, live network indicator, theme toggle and user account menu. No fake bell/notifications.
- `LedgerDashboardView.tsx` reads the **existing** shop-scoped ledger/account services. Four KPI cards distinguish balance-as-loaded from cashbook-period flows. Never call net cashbook activity accrual P&L.
- `OverviewAreaChart.tsx` renders interactive lavender income and teal expense curves from period buckets with keyboard focus, accessible data table and exact source amount tooltips.
- `Expenses by category` ring derives proportions from actual expense category reads. If category sum differs from period expenses, the UI explicitly warns.
- Day mode shows truthful daily income/expense comparison, not an invented multi-day trend. Week/Month/Custom display the source-backed area chart.
- Small screens keep existing bottom navigation and stack chart panels; KPI cards become two-column then one-column on narrow displays.
- Inter Variable is bundled; financial values are tabular. Hover is restrained and reduced motion respected. Auth, Supabase RLS, journal posting, sync, backups and ledger calculations are unchanged.

## Release gates
- CI: lint, typecheck, strict typecheck, file-size checks, full unit suite, production build.
- Browser: desktop and responsive screenshots at 360, 390, 768, 1024, 1440, both light/dark; keyboard focus and chart hover; Urdu RTL and large values.
- Finance: do not claim P&L/AR/AP/payroll/ERP modules implemented from a visual treatment.
- Keep this work in a Draft PR stacked on the prior UI preview; do not merge production or touch live customer data until authorized validation.

For deeper accounting requirements see `docs/AQVORA_PRODUCT_AND_UX_CONTRACT_2026-11-20.md`.
