# AQVORA UI finishing — preview instructions

**Review branch:** `feat/aqvora-reference-finish-20261120`, Draft PR #43, stacked on finance UI PR #40. **Not a production release.**

## What has changed in executable code

- `src/components/layout/ReferenceFinish.css`: founder-approved clean sidebar/header, quiet lavender canvas and consistent page gutters. Loaded after workspace pastel tokens.
- `src/components/dashboard/OverviewFinish.css`: real source-backed dashboard keeps four KPI cards and correct cashbook provenance; enlarges card spacing, charts and primary 2:1 chart composition. It does **not** invent orders, sales pipeline, stock or accrual P&L.
- `src/components/accounting/FinanceFinish.css`: cleaner Chart of Accounts, Journal Entry, General Ledger, Trial Balance demo styling, readable tables, mobile layout.
- Finance preview `AI Copilot` link explicitly opens the existing app AI destination. No autonomous posting or fabricated financial model output.
- Test confirms AI navigation is user-initiated and financial write actions remain disabled.

## Review preview safely

The PR branch is configured with **branch-specific Vercel preview** settings, `VITE_ENABLE_FINANCE_UI_PREVIEW=true`, and deliberately invalid Supabase URL/anon key. Real signup/financial data must remain unavailable on the review deployment.

On the latest matching Git SHA: open the Vercel **Preview** URL → **Explore Demo** → inspect the source-backed demo Dashboard → **Preview finance UI** → review four tabs → AI Copilot link. The finance tab fixtures are explicitly illustrative, not server ledgers.

Only share a deployment once its Git commit SHA matches this branch and its build started **after** the preview environment isolation was configured. Do not share any older deployment built against inherited production env settings.

## Outstanding review gates

Browser screenshot compare at 1440, 1024, 768, 390/360; dark/light, contrast, keyboard, focus, RTL, large amounts, empty/loading/errors. The real V2 account/period admin and Supabase Auth staging remain under separate Draft PRs. Never merge this branch or activate V2 financial posting solely on UI preview success.
