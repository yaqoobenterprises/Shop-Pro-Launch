# Shop Plus — Phase 01 audit (2026-11-27)

Status: **source inventory and automated baseline recorded; browser and live-security validation outstanding**. No production deployment or financial mutation performed.

## Reproducible baseline
- main: `499fc1695da4da2b3dfdfb7c59b90740c3090081`; [CI](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45879920996).
- preliminary UI branch: `3e463e8759d3ba0ca1dc447602ac9fd3d5cc70b1`; [CI](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45953503486).
- Both logs: 60 test files, 370 passing tests; npm audit reports 0 vulnerabilities; normal and strict type checks, lint, size guard and build passed. Existing suites are not a browser-based accessibility certification or a test of effective live RLS.
- Vite main output (kB / gzip kB): entry JS 565.74 / 159.27; Supabase vendor 226.69 / 58.83; entry CSS 220.43 / 38.17. Preliminary branch: 566.05 / 159.32, 226.69 / 58.83, 220.77 / 38.24 respectively. These are build artifacts, not transfer totals, measured LCP or field data.
- Public URL could not be fetched in this session. No new browser screenshots or device/assistive-technology observations yet. Prior docs/ui-audit.md is historical only.

## Research and decision traceability

| Source | Shop Plus decision |
| --- | --- |
| [Linear 2024](https://linear.app/now/how-we-redesigned-the-linear-ui), [2026](https://linear.app/now/behind-the-latest-design-refresh) | Consistent location/action hierarchy; remove repeated chrome, use compact neutral surfaces |
| [Stripe search](https://docs.stripe.com/dashboard/search) | Distinguish navigation search from transaction lookup; show supported filters and actual scope |
| [Mercury transactions](https://mercury.com/blog/updated-transactions-page) | Fast reusable views and meaningful account/period exploration |
| [Shopify views](https://help.shopify.com/en/manual/shopify-admin/productivity-tools/searching-filtering-views), [Ramp filters](https://support.ramp.com/accounting-filters-and-custom-views/) | Expose applied filters and clear/reset; preserve filter state and export scope |
| [Xero reporting basis](https://central.xero.com/0/article/Select-contents-and-display-order-in-a-new-report) | Clearly label cashbook operating result; do not imply accrual profit |
| [Carbon data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) | Dense, consistent rows, explicit actions, sorting and pagination; responsive alternatives |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) | Keyboard focus visibility, modal focus containment/restoration, non-color status, financial error prevention |
| [Web Vitals](https://web.dev/articles/vitals) | Separate lab and field measurement; evaluate p75 LCP, INP and CLS |
| [OWASP ASVS](https://asvs.owasp.org/) | Verify authorization at authoritative layer and test permissions, session handling, input validation |
| [Microsoft HAX](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/) | Make capabilities and uncertainty clear, allow correction and recovery, show verified data separately |
| [Playwright](https://playwright.dev/docs/best-practices) | Isolated demo contexts, role-based locators, resilient assertions and browser artifacts |

Additional first-party guidance recovered on follow-up:
- [Apple HIG accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility.md): use familiar interactions, non-color cues, adaptable text, contrast in both themes and practical touch targets. Shop Plus target: 44 CSS px touch controls where feasible, 200% zoom checks, no color-only financial status.
- [Material 3 adaptive layout guidance](https://developer.android.com/codelabs/adaptive-material-guidance): choose adaptive layouts at size classes and keep fluid behavior between breakpoints. Use phone-first bottom navigation, tablet rail and desktop sidebar where space supports them.
- [Carbon dashboards](https://carbondesignsystem.com/data-visualization/dashboards/): separate presentation overview from exploration reports, limit headline metrics, apply filters consistently across linked charts and keep units and legends consistent.
- [ARIA modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): focus inside on open, constrain Tab and Shift+Tab, close on Escape, return focus and prefer the least destructive initial action for financial confirmations.
No visual competitor cloning.

## Inventory and contracts

Complete recursive repository path inventory retrieved at baseline (not line-by-line review of all files). Active signed-in views in App.tsx: dashboard / LedgerDashboardView, sales / TransactionsExplorerView, chat / ChatView, accounts / AccountsView, reports / LedgerReportsView, ai / LedgerMateView, settings / LedgerSettingsView. Public/auth surfaces: LandingPage, AuthScreen, LockScreen, MfaChallengeScreen, password recovery. Global overlays: CommandPalette, ShortcutsHelpModal, QuickExpenseModal, FirstRunRegionalModal, ToastContainer. Feature-specific overlays: ConfirmationModal, EditModal, VoidModal, InstallHelpModal, TransactionDetailModal, PaperRegisterImportModal. Shared controls: Button, Input, Select, DatePicker, MonthPicker, Modal, Badge, Card, UserAvatar. Existing staged features: regionSettings, languageUr, entryModes (off); chatQueries on. Compatibility paths include SQLite, Tauri imports, legacy sync and storage. No file removal justified by name alone.

Cloud data: Supabase RLS, RPC and transaction drafts; browser IndexedDB pending work with retry/idempotency; demo data isolated. AuthContext handles identity, PIN/MFA and shop role; AppContext UI state. LedgerMate uses authenticated Vercel proxy and server-only Groq key; application action preview/confirmation owns writes. The server instructs the model to treat context as untrusted; this is not proof of prompt-injection resistance. Current tenant authorization and chat-history migration status is documented as of 2026-11-17 only, not rechecked live.

## Findings register

| Priority | Evidence | Finding and next acceptance check |
| --- | --- | --- |
| P0 | SECURITY.md, docs/ROLLOUT.md | Documented pending tenant/draft hardening; verify in isolated project and owner-approved SQL before production release |
| P0 | ledgerSummaryService.ts | Optional read path falls back to local queue; never label a partial queue summary authoritative; distinguish unknown from zero and test offline cases |
| P1 | AnimatedAmount.tsx | 720 ms count-up displays intermediate financial amounts; replace with exact amount immediately, preserve loading/error states |
| P1 | common/Modal.tsx | aria-modal and Escape present, but no focus trap, initial focus or restoration; test Tab, Shift+Tab, Escape, nested dialogs |
| P1 | lib/theme.ts | Only light/dark supported; add system preference and persist intentionally, test prepaint and switching |
| P1 | WorkspacePastel.css, index.css, dashboard/report finish styles | Multiple token definitions and override layers; green-tinted workspace and conflicting visual rules; converge tokens before removing rules |
| P1 | AccountsView.tsx | Async transfer/create paths need dedicated in-flight duplicate-submission review rather than relying on data loading; retain atomic RPC and no optimistic success |
| P1 | money.ts | parseFloat accepts numeric prefixes and rounds; audit input call sites and precision with fixtures before modifying validation semantics |
| P1 | TransactionsExplorerView.tsx | Pagination, search and type/category/status filters already exist; account/amount/sort/filter persistence and stale request behavior need review; keep all-filtered CSV semantics |
| P1 | AppContext.tsx | View state not browser history; helper exists on branch but unintegrated, verify auth callbacks and service-worker routing first |
| P1 | AI panel / SECURITY.md | Multiple chat sync limitation documented; distinguish client-only and synced history; no migration in UI PR |
| P2 | index.css (145 KB source), entry JS (565.74 kB) | investigate reachable legacy modules and style redundancy with bundle analysis, no speculative dependency removal |
| P2 | README / existing source | Naming inconsistencies remain in hard-coded strings/assets despite preliminary APP_NAME/PWA changes |
| P2 | Header.tsx | Network availability not authoritative synchronization; explicitly distinguish |
| P2 | Overview/Reports | Already support date selection and deterministic totals; verify completeness/axis labels and selected-period vs current balances before adding comparisons |

## Financial golden fixture (existing tests, passed in both CI runs)
In tests/reports_sample_month.test.ts: monthly active income 260000 paisa, expenses 550000, operating result -290000; capital introduction 1000000, drawings 200000, adjustment in 10000 and adjustment out 0. Day 1 income 80000, expenses 200000, operating result -120000. Day 3 voided 100000 excluded; active income 120000. tests/cashbook_regression.test.ts additionally asserts opening 20000, transfer legs -10000 and +10000, idempotent retry, void/restore/edit and shop scoping. Preserve these expectations; no accounting changes in this branch.

## Release gates still outstanding
Fresh baseline screenshots at 320/375/390/768/1024/1280/1440/1920, browser interaction and zoom, contrast/manual keyboard/screen reader, performance lab and field measurements, production schema parity and authenticated AI. Source inspection is bounded: not every file, dependency or feature was fully exercised. Do not mark comprehensive audit or release complete. 

## Browser audit execution follow-up

[First run](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45953931063) failed during Playwright dependency installation, before app launch. The runner default was Ubuntu 26.04, unsupported by Playwright 1.56.1. The workflow now pins Ubuntu 24.04 and matches the actual Cashbook label and desktop Settings control. [Second run](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954045248) was in progress at the time of this update. No responsive pass is claimed yet.

## Original browser baseline result (verified)

[GitHub Actions run 45954045248](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954045248) completed successfully against original commit `499fc1695da4da2b3dfdfb7c59b90740c3090081`. Its logs contain 64 measurements: eight widths (320, 375, 390, 768, 1024, 1280, 1440, 1920) across landing and seven signed-in demo surfaces. No document/main horizontal overflow, skipped navigation, or uncaught page errors were recorded by the automated script. The [screenshots and measurement artifact](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/45954045248/artifacts/15178416230) was uploaded (6.51 MB, 14-day retention). Screenshot contents have not been independently visually reviewed in this session; this is a geometry/navigation smoke test, not a complete manual UI audit. No live auth, screen-reader, zoom, touch hardware, network, or authoritative data checks were performed. These remain release gates. Phase 02 proceeds in parallel on a draft branch without changing live data.
