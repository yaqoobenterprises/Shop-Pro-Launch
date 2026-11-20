# AQVORA — functional certified V2 General Ledger / Trial Balance

**Status:** read-only, inactive-by-default functional UI, **deliberately stacked** on existing isolated staging Customer/Invoice Draft PR #69 → AR Screen PR #67 → backend #66→#63. No production activation or hosted environment changes.

## Compatibility review of sibling code

PRs #56/#58 implemented certified read validation + authenticated staging-only GL/TB transport on a separate frontend branch based on backend #53. This branch selectively copied **only** the five existing read-only validator/adapter files and their two focused Vitest suites into the latest backend #63 descendant. This avoids blind merging of unrelated frontend/UI and backend histories while preserving the exact SQL contracts.

Back-end certified `read_aqvora_general_ledger` and `read_aqvora_trial_balance` RPC signatures and `aqvora-read-v1` source metadata are stable. Backend #63 added source provenance fields (`source_kind/source_id/source_revision/source_fingerprint`) to GL lines; the read model handles them as optional metadata, and the report table shows source kind/ID. Real Auth/MFA/tenant authorization is **SQL-owned**, not granted by browser flags.

## Implemented functional workflow

- New app view `aqvora-gl-tb`, lazy-loaded via `FinanceLazyRoutes.ts` to respect `App.tsx` 300-line size gate.
- Accessible desktop Sidebar/mobile More navigation visible only to authenticated cloud OWNER/MANAGER with the isolated staging financial-read feature gate. Demo/current business projects are blocked; route itself fails closed.
- `GeneralLedgerTrialBalanceWorkspace`: dedicated date-filtered Trial Balance and posting-account-specific General Ledger views, both reachable with accessible report-type toggles.
- `src/services/aqvoraPostingAccountsReadService.ts`: actual `list_aqvora_accounts` company-scoped keyset RPC, bounded pages, rejects cross-company/duplicate accounts, includes only active posting accounts, checks authenticated session before/after every page. No arbitrary freeform journal account IDs.
- `GLTBReportPanel.tsx`: certified V2 balance/line tables. One account GL provides opening, debit/credit, closing, running balances, dates and source journal provenance. TB shows account balances and verified totals. The underlying previously verified assemblers collect **all** source-token-consistent pages or error; no report truncation or sample fallback.
- `formatExactCurrencyMinor` from parent #67 shows raw canonical money precisely as **`PKR 100 minor units`** until backend [Issue #68](https://github.com/yaqoobenterprises/Shop-Pro-Launch/issues/68) supplies authoritative company-approved currency exponent; no guessed rupee/paisa display or float rounding.
- Tests include copied #56/#58 26+ regressions plus fresh account picker and React UI tests for role/disabled gate, report totals and source provenance, stale/denied errors, pagination/identity/selector, invalid date and report switch.

## Critical accounting caveats

**A certified V2 report is not the complete economic books of an existing business.** `legacy_included=false` and `opening_migration_verified=false` are always prominent. Year-end/closing policy, hosted AAL2 security verification, currency precision and reconciliation of old Shop Pro offline books must precede rollout. Source drift `40001` discards the entire report and requires fresh page-one read.

No journal posting, reversal, financial writer enabling, customer receipt mutation, GL edit, bank reconciliation, tax/FX, AR aging or complete P&L/Balance Sheet is added. Separate source-backed flows remain gated and default OFF. No SQL migrations, hosted staging creation, paid resource, deployment, existing company financial activation, main merge or legacy data change.

## End-to-end acceptance gates before founder approval

1. Isolated hosted disposable staging project populated with synthetic companies and real AAL2 members, using approved new schema migration/rollback process.
2. Create isolated verified invoice draft, independent owner approval, server source-owned issue, controlled-cash receipt and allocation. Confirm AR control, General Ledger running balances and Trial Balance totals identical to journal/source receipts, including reverse/denied and duplicate intent cases.
3. Test long book scan performance, role revocation, cross-tenant ID probes, missing page/source corruption, session loss, mobile keyboard accessibility and actual responsive browser screenshots.
4. Founder and finance sign-off for jurisdiction tax/rounding/scale, opening balances, security advisor warnings, legacy queues and operational cash evidence limitations.

**Keep Draft:** this is working, tested browser read-only code with mocked RPC and independent backend CI, not a deployed production ERP.
