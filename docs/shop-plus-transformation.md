# Shop Plus transformation — first delivery (2026-11-27)

## Boundary and verification

This work is a **first incremental UI foundation**, not a claim that the full transformation, production database, or WCAG audit is complete. It intentionally does not touch transactions, account balances, migrations, auth, persistence, offline replay, or AI permissions. Source inspection included README, ARCHITECTURE, DATABASE, DESIGN, SECURITY, AppContext, App, Sidebar, Header, MobileNav, styles and existing UI audit. Existing earlier UI audit findings are historical evidence, not newly reproduced screenshots.

## Research translated into decisions

- Linear's UI redesign and later refresh prioritize consistent header/action placement, compact navigation and lower visual noise: apply restrained shell styles, not cloned branding. https://linear.app/now/how-we-redesigned-the-linear-ui and https://linear.app/now/behind-the-latest-design-refresh
- Stripe's search and Shopify's saved filtering model suggest keeping search discoverable while not claiming unsupported backend global search. https://docs.stripe.com/dashboard/search and https://help.shopify.com/en/manual/shopify-admin/productivity-tools/searching-filtering-views
- Carbon data-table guidance supports explicit table controls and consistent hierarchy; avoid changing existing finance predicates without fixtures. https://carbondesignsystem.com/components/data-table/usage/
- WCAG 2.2 focus not obscured, visible focus, and target size motivate keyboard-reachable collapsed navigation and enlarged touch surfaces. https://www.w3.org/TR/WCAG22/
- Playwright recommends role- and label-based locators and deterministic test fixtures, planned for later browser verification. https://playwright.dev/docs/best-practices
- Web Vitals distinguishes field p75 LCP/INP/CLS from lab checks: no numerical improvement is claimed without measurements. https://web.dev/articles/vitals

## Evidence-backed findings register

| Priority | Evidence | Finding | Action |
| --- | --- | --- | --- |
| P0 | SECURITY.md | Unresolved tenant authorization/draft boundaries described as release blockers | Leave DB unchanged; require isolated staging review |
| P0 | README.md | Financial posting retries, reports and authorization under review | Protect financial flows; no accounting changes in UI PR |
| P1 | Sidebar.css | Collapsed nav and profile controls completely hidden | Keep icon navigation accessible when collapsed |
| P1 | AppContext.tsx | Current view stored only in React state | Add URL/history synchronization for workspace views |
| P1 | App.tsx, Sidebar, Header | New transaction action not prominent in navigation chrome | Add consistent New entry access |
| P1 | config/app.ts, manifest, index.html | Shop Pro/AQVORA identity inconsistent with Shop Plus | Standardize UI and PWA names; preserve asset paths |
| P2 | Header.tsx | navigator.onLine describes connectivity, not actual Supabase synchronization | Label as network status only |
| P2 | MobileNav.tsx | Six equally cramped mobile controls; Ledger not first | Prioritize entry and keep five primary controls |

## Accounting guardrails

The ledger is a cashbook, not verified accrual profit. Cloud PostgreSQL is authoritative, integer paisa is the stored amount unit, and offline queue state does not imply posted state. No transaction or migration contracts are modified in this PR.

## Verification status

A complete Git clone was blocked by the execution environment's DNS/network restrictions. Accordingly baseline screenshots, npm lint/typecheck/test/build and browser performance metrics **were not run in this session**. Do not treat earlier documentation's test results as fresh tests. Run `npm ci && npm run lint && npm run typecheck && npm run check:strict && npm test -- --reporter=dot && npm run check:size && npm run build` on this branch and examine Vercel preview before merge. Test 320, 375, 390, 768, 1024, 1280, 1440, 1920 widths, light/dark, keyboard/screen-reader, and browser back/forward. Test finance-specific workflows against the existing PGlite fixtures before any data-layer work.
