# AQVORA — Fresh Financial Activation Readiness (Read-Only Preflight)

**2026-11-21 | Founder policy:** Fresh legal-company ERP begins with **zero** posted journals, receipts, cash and recorded opening balances. Original Shop Pro Cashbook CSV has been exported privately; no automatic migration. Do not enable a financial writer for any existing business.

## Scope

This frontend review branch is a child of green Draft #98 → #97 → #96 → #87, **not** the deferred historical import chain. A new `FreshFinanceReadinessPanel` appears under the isolated, staging-only OWNER CoA/fiscal setup route. It is a **read-only check** and must never be mistaken for approval, legal-company creation, journal activation, production rollout or a guarantee of IFRS compliance.

### Evidence-based checks

1. Reuse existing `loadFreshFinanceSetup` requiring authenticated OWNER, live session, isolated non-business Supabase project, **certified full-history zero V2 Trial Balance** and bounded, tenant-verified CoA/periods. Missing/RLS-denied source is an ERROR, not zero.
2. Check posting accounts for asset, equity, liability, revenue, expense and cost-of-sales class. Require a fiscal period, no overlaps and exactly one open period for this early setup review. These are **product preflight heuristics**, NOT complete GAAP, IFRS, statutory or chart template certification.
3. Call existing read-only, authenticated `read_aqvora_currency_policy` RPC for the beginning of every open period; validate company/currency/date and **server-approved currency exponent, immutable revision/fingerprint, provenance** using `validateCurrencyUnitPolicy`. If policy is missing, report `CURRENCY_POLICY_UNCONFIGURED`; never use the browser's Intl decimals to invent PKR/foreign currency units.
4. Re-read verified zero-books evidence after currency fetch and **reject drift**. Verify OWNER session before and after the RPC; errors never become green checkmarks.
5. Display review blockers and source token to the company OWNER. Hard contract `activationPermitted:false` is always returned, including when `checklistComplete:true`. There is **no** `INSERT` into `aqvora_enabled_companies`, no fake activation endpoint and no browser-accessible permission or owner approval shortcut.
6. Existing production Shop Pro Supabase project and any old Cashbook, offline device queues, existing business profile, or Vercel deployment are not touched.

## Important exception and backend boundary

An owner-made new finance company must be provenance-proven to be newly created, distinct from a legacy tenant, through a **trusted backend enrollment ceremony**. The browser cannot infer this from a new-looking display name, a zero TB, a fresh CoA, or localStorage. Even with green preflight, only an explicitly authorized, audited and concurrency-safe backend (issue #99) may enroll a company, after owner AAL2 + maker/checker and currency/legal-entity approvals. **The SQL financial writer remains disabled until that external step, which is NOT implemented here.**

## QA and code

- `src/services/aqvoraFreshFinanceReadinessService.ts`: strict staged owner session and company source checks, verified currency policy, read-only collection, fail-closed immutable readiness result.
- `src/components/accounting/FreshFinanceReadinessPanel.tsx`: accessible `Check readiness` button, source-backed exact status, blockers, no activation controls, company-switch stale-response guard.
- `src/components/accounting/FreshFinanceSetupWorkspace.tsx`: embeds readiness under actual CoA and fiscal-period setup.
- `tests/aqvora_fresh_activation_readiness_service.test.ts`: positive certified preflight; absent accounts/periods/policy; forged policy or wrong tenant/date; manager/revoked session; source drift and overlapping period guards; NEVER an activation RPC.
- `tests/aqvora_fresh_activation_readiness_ui.test.tsx`: interactive owner-only checks, missing-source errors, disabled staging, stale foreign-company response ignored, no activation action.

**Release gates:** Exact-head CI, independent real hosted isolated Supabase project Auth/MFA/RLS end-to-end tests, Codex issue #99 trusted atomic enrollment, customer-controlled backups/restore, safe PWA/offline upgrade and founder-approved release process. Even green CI = staging CODE, not production-ready ERP.

Tracking: https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/89 and https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/99.
