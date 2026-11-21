# Issue #68 verification record

Base: backend Draft #63 at `256172d18a435f1e91cdee56da2709e6e30ce154`.
Branch: `codex/issue-68-currency-policy`.

Complete verification run: [44873165474](https://github.com/yaqoobenterprises/Shop-Pro-Launch/actions/runs/44873165474), implementation `4f02b9b46f491c051d2453c511826d391fdccb37`. Subsequent receipt-evidence checks and contract refinements are verified again by the [current Draft #78 checks](https://github.com/yaqoobenterprises/Shop-Pro-Launch/pull/78/checks). This document does not authorize activation or claim hosted readiness.

| Check | Complete run result |
| --- | --- |
| Application | 73 files, **514 passed**; 67 environment-dependent tests skipped here and executed below |
| PostgreSQL 17 | **46 passed**: 8 writer/session, 3 fresh/deployed/restore, 3 readers, 10 invoice, 13 receipt, 9 currency race/isolation/rollback |
| Real local Supabase | 4 files, **21 passed**: 4 accounting, 3 invoice, 6 receipt, 8 currency/Auth |
| Total | **581 unique tests passed** across the three jobs |
| TypeScript, strict TypeScript, lint, size, build | Passed |
| Dependency audit | 0 vulnerabilities in CI |
| Disposable security advisor | No ERROR or new-policy findings; 3 inherited WARN findings listed below |

New issue-specific coverage totals 46 tests: 29 application/SQL contracts, 9 independent PostgreSQL and 8 real Auth/PostgREST cases. Existing source and recovery tests also have added policy assertions.

Local currency contract suite: 29 passed. Local TypeScript/strict/lint/size/build passed. An initial local full-suite invocation without the documented CI environment failed 14 legacy cloud-fixture cases; the two affected suites passed all 31 tests after using the CI test URL/key. A final full local rerun uses that environment. A standalone local npm audit endpoint failed TLS/network twice; npm ci and the CI audit reported zero vulnerabilities. No dependency or test was removed to hide either result.

The first PR migration/recovery job failed because a new inspection assertion ran under the authenticated application role and correctly could not read the private policy table. Moving only that assertion to the maintenance context fixed it; fresh/deployed installation and the full logical restore then passed. Application/real Auth jobs passed in that first run as well.

Security advisor inherited warnings: `public.enforce_transaction_author`, `private.ledger_transaction_delta`, `private.protect_transaction_account_posting` have mutable search paths. They are unchanged by #68 and remain release-review items.

## Verification scope

- PGlite contracts: PKR/USD/JPY/KWD/CLF policy and actual source invoice issuance; exact per-line tie rounding, BIGINT maximum, discounts, canonical strings; invoice/cash/customer receipt/generic posting/AR/GL/TB metadata equality; corrupt source/receipt/journal/policy rejection; OWNER/MANAGER, AAL1, cashier, foreign, inactive and revoked sessions; immutable book units; dated revisions and original response recovery; all report pagination tokens; arbitrary AR continuation rejection; full currency batch rollback; populated #63 upgrade without invented historical scale; new private function grants.
- PostgreSQL 17: independent sessions for posting-before-policy, policy-before-posting, competing policy revisions, invoice issuance and receipt settlement against policy changes, snapshot restarts, unsupported write isolation, and complete late-failure rollback. Waiting is verified from `pg_stat_activity`, not inferred from sleeps.
- Real local Supabase: actual password login, TOTP enrollment/verification, AAL1/AAL2 JWTs and PostgREST calls. Currency read states, global fixtures, private endpoint/grant denial, current membership/role/session revocation and fingerprint corruption. Existing source invoice/receipt tests also require bound metadata on real financial JSON responses, including the 150-minor-unit half-up invoice and BIGINT boundaries.
- Full migration/recovery: fresh filename order and documented deployed order; empty policy/enrollment; issued synthetic invoice, receipt, exact journals, historical/future policy revisions and original-intent replay; failed transaction; full-schema logical dump/restore into a separate disposable database and comparison of policy rows/fingerprints, amounts, counts, source receipts, audit, grants and period closure.

## Security and release review

No frontend components, `main`, existing Supabase business project, paid resource, hosted migration, legacy balance, offline queue or company activation is changed. All new policy helpers have explicit EXECUTE revocation; private table RLS/grants deny direct application access. The one new public RPC performs live company/MFA authorization. New security-definer functions use empty search paths. Policy references are recorded approval evidence, not an automatic finance/legal attestation.

Financial policy revisions and source bindings are immutable. Company locks serialize policy append with existing writer transactions. Unit-changing revisions and retroactive interpretation are blocked. READ COMMITTED is required for mutations so a stale transaction snapshot cannot issue with an obsolete policy. GL/TB/AR tokens include policy history at the report cutoff. Clients still must verify complete page coverage before calling a report complete.

## Limits

The Windows host has no Docker/PostgreSQL runtime; real PostgreSQL and local Supabase execution is delegated to disposable GitHub Actions services. PGlite uses PostgreSQL semantics but does not replace independent connection/Auth tests. The restore drill is logical `pg_dump`/`pg_restore`, not physical backup/PITR. Existing PostgreSQL/Supabase fixtures remain synthetic; no hosted staging, production load benchmark, production restore or country/accountant approval is claimed.

Founder/accountant approval is still required for the initial company currency, exact book units, authority version, approval evidence, jurisdiction/tax treatment, rollout and historical migration/cutover. Currency policies remain empty outside test fixtures. Changing currency/exponent, unsupported N/A-unit assets, FX, credits/refunds, legacy conversion and source-rounding changes require separate reviewed work. Issue #72 has not been started.
