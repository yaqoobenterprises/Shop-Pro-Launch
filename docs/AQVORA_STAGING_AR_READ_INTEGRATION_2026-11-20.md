# AQVORA — isolated staging V2 AR read integration (backend PR #63)

**State:** read-only client implementation, **disabled by default**. Intended for a disposable *approved* staging project only. No hosted project has been created. No SQL, payment, invoice mutation, company enrollment or app route activation.

## Exact server contracts

This code uses ONLY the existing, source-owned stable PostgREST RPCs in backend Draft PR #63:

| Client function | SQL RPC | Scope |
| --- | --- | --- |
| `loadIsolatedInvoiceOpenBalance(context, invoiceId)` | `get_aqvora_invoice_open_balance` | One server-certified issued invoice and its exact allocations at an explicit business-date cutoff |
| `loadIsolatedReceivablesReconciliation(context)` | `read_aqvora_receivables` | V2 source-backed customer/company totals reconciled to receivable control; aging unsupported |
| `collectIsolatedOpenInvoices(context, limits)` | `list_aqvora_open_invoices` | **All pages or error** for one customer, currency, company and cutoff; no partial results |

Files:
- `src/services/aqvoraReceivablesStagingGate.ts`: staging-only host/ref gate and matching cloud session checks before/after each RPC.
- `src/services/aqvoraReceivablesReadService.ts`: actual PostgREST transport, strict source+user identity validation, bounded complete list assembly.
- `tests/aqvora_receivables_staging_transport.test.ts` and `tests/aqvora_receivables_staging_collection.test.ts`: feature-off, wrong host, cloud session, RPC signatures, SQLSTATE, integrity, full/partial, source token, duplicates, count, max-pages and oversized reports.

## Explicit feature gate

All must hold:

1. `VITE_ENABLE_AQVORA_VERIFIED_AR_READS=true`
2. `VITE_AQVORA_ISOLATED_STAGING_REVIEW=true`
3. `VITE_AQVORA_STAGING_PROJECT_REF`: exact 20-lowercase-letter project ref, not either known existing business project
4. Configured publishable/anon key, exact URL `https://<project-ref>.supabase.co` and matching authenticated cloud account session.
5. **SQL** independently authorizes live AAL2 session, active OWNER/MANAGER membership, company-scoped source and role. **The browser env gate is NOT an authorization control.**

The feature remains unmounted and default OFF on every environment, including production. An authorized future integration branch will attach one dedicated functional AR route after hosted staging verification and founder approval. Do not expose an alternate 'demo fallback' path when a live RPC fails.

## Pagination and financial validity

- A page alone is NOT a complete financial report; all returned rows must match the stable `matched_count` at the terminal page.
- Every continuation sends the previous `p_snapshot_token` and `p_after_id` exactly as supplied by SQL. Changing token, authorized user/role, source coverage, source totals or row count is rejected.
- Duplicate/out-of-order UUIDs, settled invoices in an open list, malformed money, fake journal allocation references, improper cutoff or nonmatching company/customer/currency fail closed via parent PR #64 validators.
- Bounds: 1–200 rows per page (default 100), 1–1000 pages (default 100), 1–200,000 rows (default 10,000); overlimit returns **error, no partial report**.
- SQLSTATE `40001` is propagated: new read must restart from page one. Do not reuse old rows. A `42501` access denial, `23514` corruption and offline/expired session also return no report.
- Exact money stays canonical **integer minor-unit strings**, not JavaScript `Number` totals.
- `complete:true` refers only to **this certified V2 open-invoice selection**, never all of an existing company's economic receivables. `legacyIncluded:false`, `bankVerified:false`. Cash evidence remains manual dual-control attestation, NOT independent bank verification.
- As-of cutoff is **business-date based**. Later backdated posting can change the result on a fresh read; source change token guards against mixing pages, not a permanent historical audit snapshot.

## Release blockers

1. Real hosted **disposable** staging with synthetic companies, real AAL2 membership and owner/manager roles; no migrations on existing business projects.
2. Explicit permission errors, loading/offline UX, accessible keyboard & mobile functional AR screen, with no false paid balances or disabled buttons implied live.
3. Deliberately reconcile backend #63 and read-only PRs #64 → this PR with GL/TB #56→#58, old incompatible invoice readers #61/#62 and frontend UI #50; no blanket sibling merges.
4. Cash handling evidence policy, tax/rounding regional signoff, unallocatable cash, refunds, credits, bank reconciliation, aging, opening balance/legacy queue protection, advisor warnings, performance and migration-lock rehearsal.
5. Founder approval before any merge to `main`, production Supabase, company enrollment, writer activation or paid infrastructure.

**This PR is a safe frontend engineering deliverable; it does not make AQVORA production-ready.**
