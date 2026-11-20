# AQVORA — Locked UI Finishing Reference (20 November 2026)

**Founder-approved north star:** user-supplied Poital.flow Sales Overview screenshot (1600 × 1200). This takes precedence over our earlier dense AQVORA conceptual renders for **visual density, spacing, card surfaces, chart balance, navigation hierarchy and typography**. Reuse the composition system, **not** the reference brand, pixel assets, copy or invented financial statistics.

**Status:** DESIGN LOCK for future UI design/review — not a claim that the current application already matches perfectly. Keep scope to frontend/design; it does not authorize touching the production database or financial writer.

## What is locked from the exact reference

1. **Canvas and hierarchy.** A soft, cool lavender-grey application canvas (sampled approximately `#e8e7ec`; existing AQVORA `--soft: #e7e6eb` is close), with the sidebar and working canvas visually unified. Most content cards are true white `#fff`. Charcoal text, not overwhelming black or saturated navy on every element. Navy/emerald remain exclusive AQVORA logo brand accents.
2. **Header.** One quiet top row: prominent AQVORA identity on left, short horizontal search input, notifications/profile controls to the right *only where those features really exist*. On each route, one compact page heading and date-range control aligned to the upper right. No oversized marketing hero inside the authenticated product.
3. **Sidebar.** Airy left rail, lightweight line icons, ~44–48px navigation row targets, generous vertical gap, simple visible active state and clear separation for Settings/Help/Theme/Account. Can hold many real module entries, organized by collapsible groups. Don't expand every submenu at once or render nonfunctional links merely to fill space. Responsive: collapse rail on tablet; appropriate bottom/drawer navigation on mobile.
4. **KPI cards.** Dashboard overview has **no more than four top KPI cards** in one desktop row: charcoal `#4d4b4c`, pale mint `#ecfffd`, pale blush `#feeaf5`, white. Restrained single icon, short label, prominent tabular value, one concise comparison. Internal padding roughly 20–24px, equal height, modest 10–12px corner radius. No second dense row of eight other KPIs; link to focused modules for deeper analysis.
5. **Chart composition.** Under KPIs, the anchor uses a large **~2:1 main-trend vs secondary ring** chart split. A second row may use ~1:2 small-trend vs wider bar-chart split. Charts live in white panels, with subtle dotted horizontal guides, thin lavender `#9189df`, mint/teal `#55cdbb`, and pink `#f58fcc` accents. Keep axis text readable, labels limited, legends short, optional tooltip and period selector. No 3D, gradients-as-clutter, tiny sparklines for every number, or excessive simultaneous widgets.
6. **Spacing.** Target desktop outer-content gutters ~24–30px, section-to-section vertical ~22–28px, card gaps 14–18px, card inset ~18–24px. A clear rhythm matters more than literal pixels. Content must **breathe** at 1366px and 1920px widths. Prefer thin or no visible card borders and tiny shadows; no thick outlines or glassy gradients.
7. **Typography.** AQVORA retains bundled Inter Variable. Page title roughly 21–25px, card header 16–18px, KPI figures 28–34px, regular content 13–14px, secondary metadata 11–12px. Use sensible weights (title 650–700; body 400–500) and financial tabular numerals. Maintain contrast; grey must not become faint/unreadable.
8. **Interaction finish.** Soft 120–180ms transitions, coherent hover/focus, true disabled states, visible data source/as-of currency, legible charts, responsive scrolling in wide tables. Dark mode should translate the same hierarchy (slate canvas and surfaces) rather than color-invert the entire picture.

## Density rules — unlike the earlier generated concepts

- **Overview = summary, not the whole ERP.** Four KPIs + 1–2 primary analytic blocks per scroll region. Secondary analytic panels below the fold are okay, but don't place all GL, P&L, Balance Sheet, AR, AP, Inventory, Payroll and Admin on the same screen.
- **One route, one primary job.** Chart of Accounts → manage/search chart; Journal Entry → compose/review one entry; General Ledger → inspect one account; Trial Balance → inspect balances and drill through; Sales, Purchases, Inventory, Payroll and Admin are separate workflows.
- **Sidebar holds module navigation** instead of cramming every topic into dashboard cards. Use progressive disclosure, contextual detail drawers, search and grouped filters.
- **Right rail is optional, not permanently occupied.** The Poital.flow reference has no giant always-on AI panel. Preserve full-width charts and tables.

## AQVORA AI — important, but visually quiet and operationally safe

- AI Copilot remains a dedicated **sidebar destination** and a small contextual "Ask AQVORA" entry in relevant workflows.
- Context-aware **slide-out assistant drawer** or compact insight row appears on explicit user request / relevant signal, not an oversized default third column.
- Features: summarize verified reports with source dates, explain account movements, highlight cash-flow or expenses, suggest correct categories, propose *draft* journal lines, flag possible duplicates, surface due invoices and inventory alerts as their verified operational sources come online.
- Every AI recommendation must distinguish **verified ledger facts** from model inference or estimates, show uncertainty, and retain drill-through to source records. AI must **not autonomously post/modify financial data**, grant access, or override fiscal locks. Explicit user confirmation + authoritative server validation are mandatory.
- AI is backend intelligence **plus** contextual presentation. A large chatbot pasted on every screen is not the objective.

## Responsive and correctness review checklist

- Desktop 1440px+: sidebar + clean two-column analytic composition, max 4 KPIs top row.
- Laptop 1024–1365px: preserve whitespace; chart widths and axes remain legible. Tablet 768px: sidebar collapses, charts stack or reflow. Mobile 360/390px: 1–2 KPI columns, accessible controls, no horizontally compressed charts; transactional tables scroll in own surfaces.
- Verify light and dark, keyboard, reduced motion, long amounts, loading/empty/permission/error cases and RTL content.
- KPI provenance must remain accurate and distinct: bank balance is not profit; cashbook net movement is not accrual earnings. No fake analytics to make the page look full.

## Existing implementation and next retrofit

- Reuse `src/components/layout/WorkspacePastel.css`, `src/components/dashboard/OverviewReference.css`, and existing branded `src/components/accounting/` preview; refactor **toward this lock** rather than another new design direction.
- Finance UI Draft PR #40: preserve correct disabled posting and sample-disclosure safety while updating visual rhythm. Backend Draft PR #41 is independent.
- UI is **not approved as pixel-finished** until actual side-by-side desktop/mobile screenshots are reviewed against the uploaded screenshot. The reference image is a style/spacing benchmark; exact business text and labels will be AQVORA's own.
