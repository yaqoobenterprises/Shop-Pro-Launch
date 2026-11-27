# Shop Pro UI overhaul

## Scope and findings

The production source at c2bbfbb is React 19, TypeScript, Vite 6, Tailwind 4 and Lucide, with Supabase, IndexedDB and optional Tauri SQLite. The app switches seven lazy views through AppContext; it does not contain product, customer, supplier, inventory, POS or invoice screens. Those modules have not been invented as part of this redesign.

The previous interface loaded 18 overlapping CSS skins, a large legacy layout stylesheet, and a separate typography override. Component anatomy and colors could therefore depend on import order. The desktop navigation was horizontal, financial amounts counted through interim values, charts used custom SVG geometry, and the entries register used div grids. Dialogs did not contain focus. Popovers used independent body portals, so they needed to join the new dialog focus hierarchy. Account create/transfer forms lacked an immediate submission lock.

## Screen coverage

| Surface | Presentation and interaction changes | Preserved contracts |
| --- | --- | --- |
| Application shell | Collapsible sidebar, grouped navigation, compact breadcrumb header, keyboard command search, matching ledger entries, Radix profile menu and mobile sheet | Existing view IDs, shortcuts, offline sync and workspace gates |
| Overview | KPI cards, real series sparklines, optional equal-length prior-period comparisons, ECharts cash flow and expense distribution, exact data and keyboard date selection | Daily summary, period filters, integer minor units, category totals and current account balances |
| Cashbook | Consistent summary cards, activity register, category chips, composer, review/edit/void dialogs and explicit empty states | Parser, review before save, drafts, account assignment, undo, optimistic concurrency and offline queue |
| Entries | Semantic TanStack table, column visibility/resizing, server pagination, date/type/category/status/search filters, detail and void actions | Scoped service query, newest-first server order, all-filtered CSV export and permissions |
| Accounts | Clear balance cards, account controls, allocation bars, focused creation/transfer dialogs and deactivation confirmation | Providers, opening balances, zero-balance deactivation rule, offline replay and transfer service |
| Reports | Consistent filters/KPIs, ECharts trends/results/distribution, category tables and TanStack register | Full filtered workbook exports, report calculation and date grouping |
| Report register | Full-result client sorting/search, sticky headers, pagination, column controls and selected-row CSV export | Selection is used for export only; no bulk financial mutations |
| LedgerMate | Shared colors, typography, borders and surface treatment | Existing conversations, API/auth, pending action review, error/retry and read-only prompts |
| Settings | Section navigation, shared forms, appearance, profile, security, categories and data tools | User preferences, MFA/PIN, role checks, archive rules and recovery validation |
| Public/auth | Matching brand, restrained marketing composition and split authentication layout | Shop Pro naming/logo, signup/signin, recovery, MFA, PIN and demo isolation |

## System architecture

- `tokens.json` is the canonical source for themes, typography, spacing, radius, controls, motion, icons and charts. `npm run tokens:generate` produces CSS and an asset hash manifest. `npm run check:tokens` detects drift.
- `components/ui` contains MIT shadcn/ui registry sources adapted for the installed Radix aggregate package and Shop Pro tokens. Existing common components adapt their current props to these primitives.
- New application/public/assistant/chart styles replace the legacy skins. Existing feature class names remain compatibility hooks, not independent palettes.
- Manrope is locally hosted; financial values use tabular numerals. Lucide uses a consistent stroke.
- ECharts imports only bar, line and pie charts plus necessary components and the SVG renderer. Chart instances resize and dispose with their hosts. Tooltips use rich text instead of interpolated HTML.
- Cash-flow axes include zero; signed result lines include a zero reference. Donuts preserve complete shares without decorative gaps; crowded category sets use horizontal bars. Exact minor-unit amounts and category shares remain accessible without hover. Empty and unsafe totals produce explicit states.
- Motion is limited to short functional transitions. CSS and Motion both respect reduced motion. Monetary figures render their exact value immediately.
- No database migration, RPC, API handler, authentication service, offline storage format, RLS policy or financial calculation was changed.

## References

Implementation sources: [shadcn/ui](https://ui.shadcn.com/docs/components), [ECharts handbook](https://echarts.apache.org/handbook/en/basics/import/), [TanStack Table v8](https://tanstack.com/table/v8/docs/guide/pagination), [Motion accessibility](https://motion.dev/docs/react-accessibility).
Design references: [Tremor blocks](https://blocks.tremor.so/blocks), [Tweakcn](https://tweakcn.com/editor/theme), [Google Fonts / Manrope](https://fonts.google.com/specimen/Manrope), [Lucide](https://lucide.dev/), [Untitled UI](https://www.untitledui.com/) and the publicly accessible [Mobbin](https://mobbin.com/) site. No paid components or proprietary assets were installed.

## Verification

The local regression suite passes 64 files / 385 tests, including ledger math, scoped reads, permissions, offline replay, concurrency, exports, transaction review and the new table/comparison checks. Production build, lint, strict TypeScript, file-size checks, token consistency and dependency audit pass. GitHub CI also passed the initial overhaul commit.

Rendered desktop/mobile and light/dark browser QA remains unverified: the managed preview relay is unavailable, and Vercel protects the branch preview with sign-in. Automatic approval review rejected creating a share link because it would broaden access to anyone holding it. No deployment protection, audience or credentials were changed. PR #111 remains a draft pending preview access and visual review; production still runs the prior version.
